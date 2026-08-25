import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import type Database from 'better-sqlite3';
import {
    forgeHostCompleteSchema,
    type ForgeHostCompleteInput,
} from '../../../src/tools/cstar-kernel-mcp/contracts/forge_host_completion.js';
import { handleForgeHostComplete } from '../../../src/tools/cstar-kernel-mcp/tools/forge_host_complete.js';
import { captureForgeHostPathIdentities } from '../../../src/tools/pennyone/intel/forge_host_path_identity.js';
import { completeForgeHostWorker } from '../../../src/tools/pennyone/intel/forge_host_worker_completion.js';
import {
    getForgeAttempt,
    markForgeAttemptStarted,
    reserveForgeAttempt,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import {
    cleanupForgeReceiptFixtures,
    createForgeReceiptFixture,
    forgeRequestInput,
    insertForgeReceiptBead,
    saveAndAuthorizeForgeRequest,
} from './forge_receipt_test_support.js';

const roots: string[] = [];

function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)]));
}

function sha256(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
}

function fileSha256(value: Buffer): string {
    return createHash('sha256').update(value).digest('hex');
}

function fixture(outputCount = 1): { db: Database.Database; input: ForgeHostCompleteInput; attemptId: string; root: string } {
    const hall = createForgeReceiptFixture();
    roots.push(hall.root);
    const beadId = 'bead:test:host-completion';
    insertForgeReceiptBead(hall.db, hall.repoId, beadId);
    const projectRoot = path.join(hall.root, 'project');
    const target = path.join(projectRoot, 'src', 'worker.ts');
    const outputPaths = Array.from({ length: outputCount }, (_, index) => path.join(
        projectRoot, 'dist', index === 0 ? 'result.json' : `result-${index + 1}.json`,
    ));
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.dirname(outputPaths[0]!), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, 'export const worker = true;\n', { mode: 0o600 });
    const targetPaths = [target];
    const scopeSha256 = sha256(targetPaths);
    const request = forgeRequestInput(hall.repoId, beadId, {
        request_summary_json: JSON.stringify({ schema: 'cstar.forge_request.v3' }),
        target_paths_sha256: scopeSha256,
    });
    const authorization = saveAndAuthorizeForgeRequest(hall.db, request).authorization;
    const reserved = reserveForgeAttempt(hall.db, {
        request_id: request.request_id,
        authorization_id: authorization.authorization_id,
        idempotency_key: 'host-completion-001',
        execution_receipt_id: 'forge-execute-host-completion',
        adapter_ref: request.adapter_ref!,
        provider: 'codex-host',
        requested_model: 'gpt-5.6-luna',
        model_source: 'unreported',
        reasoning_profile: 'max',
        adapter_version: 'cstar.codex_host_worker_job.v2',
    }).attempt;
    markForgeAttemptStarted(hall.db, reserved.attempt_id);
    const now = Date.now();
    const jobBase = {
        schema: 'cstar.codex_host_worker_job.v2' as const,
        worker_kind: 'forge' as const,
        workflow_surface: 'forge' as const,
        bead_id: beadId,
        decision_id: request.decision_id,
        canonical_request_id: request.request_id,
        canonical_request_sha256: request.request_sha256,
        authorization_id: authorization.authorization_id,
        authorization_expires_at: authorization.expires_at!,
        runner_owner: 'codex-host' as const,
        requested_model: 'gpt-5.6-luna' as const,
        requested_reasoning: 'max' as const,
        selector_status: 'enforced' as const,
        actual_identity: null,
        transport: 'codex-host' as const,
        cognition_launch: false as const,
        cstar_launch: false as const,
        provider_requests_started: 0 as const,
        spend_uncertain: false as const,
        known_spend_observed: false as const,
        network_accessed: false as const,
        idempotency_key: 'host-completion-001',
        execution_deadline_at: authorization.expires_at!,
        attempt_id: reserved.attempt_id,
        objective: 'Complete one bounded host delivery.',
        expected_artifacts: outputPaths.map((_, index) => ({
            name: index === 0 ? 'result' : `result-${index + 1}`,
            artifact_kind: 'other' as const,
            required: true as const,
        })),
        job_id: 'codex-host-job-completion',
        host_launch_required: true as const,
        project_root: projectRoot,
        target_paths: targetPaths,
        output_paths: outputPaths,
        target_paths_sha256: scopeSha256,
        path_identity_bindings: captureForgeHostPathIdentities(targetPaths, outputPaths),
        validation_ticket_binding: {
            schema: 'cstar.validation_ticket_binding.v1' as const,
            repository_id: hall.repoId,
            bead_id: beadId,
            execution_receipt_id: reserved.execution_receipt_id,
            attempt_id: reserved.attempt_id,
            scope_sha256: scopeSha256,
            one_use: true as const,
        },
        validation_ticket_request: {
            schema: 'cstar.validation_ticket_request.v1' as const,
            repository_id: hall.repoId,
            bead_id: beadId,
            execution_receipt_id: reserved.execution_receipt_id,
            attempt_id: reserved.attempt_id,
            scope_sha256: scopeSha256,
            one_use: true as const,
            expires_at: Math.min(authorization.expires_at!, now + 30_000),
            validator_thread_id: 'independent-validator-thread',
            validator_turn_id: 'independent-validator-turn',
        },
    };
    const job = {
        ...jobBase,
        dispatch_receipt_sha256: sha256(jobBase),
    } as ForgeHostCompleteInput['job'];
    const artifacts = outputPaths.map((output, index) => {
        const bytes = Buffer.from(JSON.stringify({ delivered: true, index }) + '\n');
        fs.writeFileSync(output, bytes, { mode: 0o600 });
        return { path: output, sha256: fileSha256(bytes), byte_count: bytes.byteLength };
    });
    const artifactManifest = {
        schema: 'cstar.forge_host_artifact_manifest.v1' as const,
        artifacts,
        total_bytes: artifacts.reduce((total, artifact) => total + artifact.byte_count, 0),
    };
    const input = {
        schema: 'cstar.forge_host_completion.v1' as const,
        forge_request_receipt_id: request.request_id,
        request_sha256: request.request_sha256,
        execution_receipt_id: reserved.execution_receipt_id,
        attempt_id: reserved.attempt_id,
        idempotency_key: 'host-completion-001',
        scope_sha256: scopeSha256,
        handoff_sha256: sha256({ schema: 'cstar.forge_codex_host_worker_handoff.v1', job }),
        host_job_id: job.job_id!,
        job,
        result_status: 'SUCCEEDED',
        result_artifact_sha256: artifacts[0]!.sha256,
        artifact_manifest: artifactManifest,
        provider_requests_started: 0 as const,
        provider_requests_completed: 0 as const,
        provider_requests_ambiguous: 0 as const,
        live_spend: false as const,
        live_spend_unknown: false as const,
        known_spend_observed: false as const,
        network_accessed: false as const,
        cognition_launch: false as const,
        cstar_launch: false as const,
        validator_thread_id: 'independent-validator-thread',
        validator_turn_id: 'independent-validator-turn',
        observed_at: now,
    } satisfies ForgeHostCompleteInput;
    assert.equal(forgeHostCompleteSchema.safeParse(input).success, true);
    return { db: hall.db, input, attemptId: reserved.attempt_id, root: hall.root };
}

function row(db: Database.Database, attemptId: string): Record<string, unknown> {
    return db.prepare('SELECT * FROM hall_forge_attempts WHERE attempt_id = ?').get(attemptId) as Record<string, unknown>;
}

function responseBody(response: { content: Array<{ text: string }> }): Record<string, unknown> {
    return JSON.parse(response.content[0]!.text) as Record<string, unknown>;
}

afterEach(() => {
    cleanupForgeReceiptFixtures();
    while (roots.length) roots.pop();
});

describe('Codex-host Forge completion seam', () => {
    it('records bounded delivery, keeps STARTED, normalizes zero spend, and issues one ticket', () => {
        const item = fixture();
        const result = completeForgeHostWorker(item.db, item.input);
        const attempt = getForgeAttempt(item.db, item.attemptId)!;
        assert.equal(result.replayed, false);
        assert.equal(attempt.status, 'STARTED');
        assert.equal(attempt.result_status, 'DELIVERED_PENDING_VALIDATION:SUCCEEDED');
        assert.equal(attempt.provider_requests_started, 0);
        assert.equal(attempt.live_spend, 0);
        assert.equal(attempt.live_spend_unknown, 0);
        assert.equal(attempt.known_spend_observed, 0);
        assert.equal(attempt.provider_evidence_valid, 1);
        assert.equal(result.validation_ticket_status, 'issued');
        assert.ok(result.validation_ticket?.ticket);
        assert.equal(item.db.prepare('SELECT COUNT(*) AS count FROM hall_forge_validation_tickets').get()!.count, 1);
    });

    it('rolls back delivery when zero-spend normalization aborts', () => {
        const item = fixture();
        item.db.exec(`
            CREATE TRIGGER synthetic_normalization_abort
            BEFORE UPDATE OF provider_evidence_valid ON hall_forge_attempts
            WHEN NEW.provider_evidence_valid = 1
            BEGIN
                SELECT RAISE(ABORT, 'synthetic_normalization_failure');
            END;
        `);
        assert.throws(
            () => completeForgeHostWorker(item.db, item.input),
            /synthetic_normalization_failure/,
        );
        const attempt = getForgeAttempt(item.db, item.attemptId)!;
        assert.equal(attempt.status, 'STARTED');
        assert.equal(attempt.result_status, undefined);
        assert.equal(attempt.external_execution_id, undefined);
        assert.equal(attempt.live_spend_unknown, 1);
        assert.equal(item.db.prepare('SELECT COUNT(*) AS count FROM hall_forge_validation_tickets').get()!.count, 0);
    });

    it('requires exact output coverage and verifies actual digest and size before mutation', () => {
        const multiple = fixture(2);
        const first = multiple.input.artifact_manifest.artifacts[0]!;
        const incomplete = {
            ...multiple.input,
            artifact_manifest: {
                ...multiple.input.artifact_manifest,
                artifacts: [first],
                total_bytes: first.byte_count,
            },
        };
        assert.equal(forgeHostCompleteSchema.safeParse(incomplete).success, false);
        assert.throws(() => completeForgeHostWorker(multiple.db, incomplete), /contract_invalid/);

        const targetOnly = fixture();
        const target = targetOnly.input.job.target_paths![0]!;
        const targetBytes = fs.readFileSync(target);
        assert.equal(forgeHostCompleteSchema.safeParse({
            ...targetOnly.input,
            result_artifact_sha256: fileSha256(targetBytes),
            artifact_manifest: {
                schema: 'cstar.forge_host_artifact_manifest.v1',
                artifacts: [{ path: target, sha256: fileSha256(targetBytes), byte_count: targetBytes.byteLength }],
                total_bytes: targetBytes.byteLength,
            },
        }).success, false);

        const wrong = fixture();
        const artifact = wrong.input.artifact_manifest.artifacts[0]!;
        const wrongDigest = 'f'.repeat(64);
        const wrongDigestInput = {
            ...wrong.input,
            result_artifact_sha256: wrongDigest,
            artifact_manifest: {
                ...wrong.input.artifact_manifest,
                artifacts: [{ ...artifact, sha256: wrongDigest }],
            },
        };
        assert.equal(forgeHostCompleteSchema.safeParse(wrongDigestInput).success, true);
        assert.throws(() => completeForgeHostWorker(wrong.db, wrongDigestInput), /artifact_digest_mismatch/);
        assert.equal(getForgeAttempt(wrong.db, wrong.attemptId)!.result_status, undefined);

        const wrongSize = fixture();
        const sized = wrongSize.input.artifact_manifest.artifacts[0]!;
        assert.throws(() => completeForgeHostWorker(wrongSize.db, {
            ...wrongSize.input,
            artifact_manifest: {
                ...wrongSize.input.artifact_manifest,
                artifacts: [{ ...sized, byte_count: sized.byte_count + 1 }],
                total_bytes: sized.byte_count + 1,
            },
        }), /artifact_size_mismatch/);
    });

    it('rejects unsafe artifact filesystem identities before delivery', () => {
        const missing = fixture();
        fs.unlinkSync(missing.input.artifact_manifest.artifacts[0]!.path);
        assert.throws(() => completeForgeHostWorker(missing.db, missing.input), /artifact_missing/);

        const directory = fixture();
        const directoryPath = directory.input.artifact_manifest.artifacts[0]!.path;
        fs.unlinkSync(directoryPath);
        fs.mkdirSync(directoryPath);
        assert.throws(() => completeForgeHostWorker(directory.db, directory.input), /artifact_not_regular_file/);

        const symlink = fixture();
        const symlinkPath = symlink.input.artifact_manifest.artifacts[0]!.path;
        fs.unlinkSync(symlinkPath);
        fs.symlinkSync(symlink.input.job.target_paths![0]!, symlinkPath);
        assert.throws(() => completeForgeHostWorker(symlink.db, symlink.input), /artifact_symlink/);

        const parentLink = fixture();
        const linkedOutput = parentLink.input.artifact_manifest.artifacts[0]!.path;
        const linkedParent = path.dirname(linkedOutput);
        const realParent = `${linkedParent}-real`;
        fs.renameSync(linkedParent, realParent);
        fs.symlinkSync(realParent, linkedParent, 'dir');
        assert.throws(() => completeForgeHostWorker(parentLink.db, parentLink.input), /artifact_identity_invalid/);

        const hardlink = fixture();
        const hardlinkPath = hardlink.input.artifact_manifest.artifacts[0]!.path;
        fs.linkSync(hardlinkPath, path.join(hardlink.root, 'artifact-hardlink'));
        assert.throws(() => completeForgeHostWorker(hardlink.db, hardlink.input), /artifact_hardlink/);

        const writable = fixture();
        fs.chmodSync(writable.input.artifact_manifest.artifacts[0]!.path, 0o666);
        assert.throws(() => completeForgeHostWorker(writable.db, writable.input), /artifact_owner_control_invalid/);
        assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(),
            'src/tools/pennyone/intel/forge_host_worker_completion.ts'), 'utf8'), /\/proc\/self\/fd/);
    });

    it('rejects artifact replacement during the bounded descriptor read', () => {
        const item = fixture();
        const output = item.input.artifact_manifest.artifacts[0]!.path;
        const replacementBytes = fs.readFileSync(output);
        const mutableFs = fs as unknown as { readSync: (...args: any[]) => number };
        const originalRead = mutableFs.readSync;
        let replaced = false;
        mutableFs.readSync = (...args: any[]) => {
            const count = originalRead(...args);
            if (!replaced && count > 0) {
                replaced = true;
                fs.renameSync(output, `${output}.during-read`);
                fs.writeFileSync(output, replacementBytes, { mode: 0o600 });
            }
            return count;
        };
        try {
            assert.throws(() => completeForgeHostWorker(item.db, item.input), /artifact_changed_during_read/);
        } finally {
            mutableFs.readSync = originalRead;
        }
        assert.equal(getForgeAttempt(item.db, item.attemptId)!.result_status, undefined);
    });

    it('replays the exact completion without changing durable rows or issuing a second ticket', () => {
        const item = fixture();
        const first = completeForgeHostWorker(item.db, item.input);
        const before = row(item.db, item.attemptId);
        const ticketCount = item.db.prepare('SELECT COUNT(*) AS count FROM hall_forge_validation_tickets').get()!.count;
        const replay = completeForgeHostWorker(item.db, item.input);
        assert.equal(replay.replayed, true);
        assert.equal(replay.completion_fingerprint_sha256, first.completion_fingerprint_sha256);
        assert.deepEqual(row(item.db, item.attemptId), before);
        assert.equal(item.db.prepare('SELECT COUNT(*) AS count FROM hall_forge_validation_tickets').get()!.count, ticketCount);
        assert.equal(replay.validation_ticket_status, 'already_issued');
        const output = item.input.artifact_manifest.artifacts[0]!.path;
        const drifted = fs.readFileSync(output);
        drifted[0] = drifted[0]! ^ 1;
        fs.writeFileSync(output, drifted, { mode: 0o600 });
        assert.throws(() => completeForgeHostWorker(item.db, item.input), /artifact_digest_mismatch/);
        assert.deepEqual(row(item.db, item.attemptId), before);
        assert.equal(item.db.prepare('SELECT COUNT(*) AS count FROM hall_forge_validation_tickets').get()!.count, ticketCount);
    });

    it('rejects conflicting replay and every identity/hash/scope/job drift', () => {
        const item = fixture();
        completeForgeHostWorker(item.db, item.input);
        const drifts: Array<Partial<ForgeHostCompleteInput>> = [
            { execution_receipt_id: 'forge-execute-other' },
            { attempt_id: 'attempt-other' },
            { forge_request_receipt_id: 'dispatch-forge-other' },
            { request_sha256: 'a'.repeat(64) },
            { scope_sha256: 'b'.repeat(64) },
            { handoff_sha256: 'c'.repeat(64) },
            { host_job_id: 'codex-host-job-other' },
            { result_status: 'FAILED' },
            { artifact_manifest: { ...item.input.artifact_manifest, artifacts: [{ ...item.input.artifact_manifest.artifacts[0]!, sha256: 'f'.repeat(64) }] } },
        ];
        for (const drift of drifts) {
            assert.throws(() => completeForgeHostWorker(item.db, { ...item.input, ...drift }), /forge_host_completion_/);
        }
        assert.equal(getForgeAttempt(item.db, item.attemptId)!.result_status, 'DELIVERED_PENDING_VALIDATION:SUCCEEDED');
    });

    it('rejects UNKNOWN and terminal attempts, path escape, high volume, secret-like payloads, and spend claims', async () => {
        const nonV3 = fixture();
        nonV3.db.prepare('UPDATE hall_forge_requests SET request_summary_json = ? WHERE request_id = ?')
            .run(JSON.stringify({ schema: 'cstar.forge_request.v2' }), nonV3.input.forge_request_receipt_id);
        assert.throws(() => completeForgeHostWorker(nonV3.db, nonV3.input), /current_v3_required/);

        const unknown = fixture();
        unknown.db.prepare("UPDATE hall_forge_attempts SET status = 'UNKNOWN' WHERE attempt_id = ?").run(unknown.attemptId);
        assert.throws(() => completeForgeHostWorker(unknown.db, unknown.input), /unknown_attempt/);

        const terminal = fixture();
        terminal.db.prepare("UPDATE hall_forge_attempts SET status = 'FAILED_FINAL' WHERE attempt_id = ?").run(terminal.attemptId);
        assert.throws(() => completeForgeHostWorker(terminal.db, terminal.input), /terminal_attempt/);

        const escaped = fixture();
        const escapeInput = {
            ...escaped.input,
            artifact_manifest: {
                ...escaped.input.artifact_manifest,
                artifacts: [{ ...escaped.input.artifact_manifest.artifacts[0]!, path: path.join(escaped.root, 'outside.json') }],
            },
        };
        assert.equal(forgeHostCompleteSchema.safeParse(escapeInput).success, false);

        const highVolume = fixture();
        const artifacts = Array.from({ length: 33 }, (_, index) => ({
            path: path.join(highVolume.root, 'project', `artifact-${index}.json`),
            sha256: `${index.toString(16).padStart(2, '0')}${'a'.repeat(62)}`,
            byte_count: 1,
        }));
        assert.equal(forgeHostCompleteSchema.safeParse({
            ...highVolume.input,
            artifact_manifest: { schema: 'cstar.forge_host_artifact_manifest.v1', artifacts, total_bytes: 33 },
        }).success, false);
        assert.equal(forgeHostCompleteSchema.safeParse({
            ...highVolume.input,
            artifact_manifest: {
                ...highVolume.input.artifact_manifest,
                artifacts: [{ ...highVolume.input.artifact_manifest.artifacts[0]!, byte_count: 64 * 1024 * 1024 }],
                total_bytes: 64 * 1024 * 1024,
            },
        }).success, false);
        assert.equal(forgeHostCompleteSchema.safeParse({
            ...highVolume.input,
            artifact_manifest: {
                ...highVolume.input.artifact_manifest,
                artifacts: [{ ...highVolume.input.artifact_manifest.artifacts[0]!, content: 'sk-test-secret-value' }],
            },
        }).success, false);
        assert.equal(forgeHostCompleteSchema.safeParse({
            ...highVolume.input,
            provider_requests_started: 1,
        }).success, false);

        const response = await handleForgeHostComplete({
            ...highVolume.input,
            provider_requests_started: 1,
        }, undefined, { db: highVolume.db });
        assert.equal(response.isError, undefined);
        const body = responseBody(response);
        assert.equal(body.outcome, 'guardrail_block');
        assert.equal(body.outcome_kind, 'guardrail');
        assert.equal(body.is_error, false);
    });

    it('returns typed MCP outcomes without isError for success and domain failures', async () => {
        const recorded = fixture();
        const success = await handleForgeHostComplete(recorded.input, undefined, { db: recorded.db });
        const successBody = responseBody(success);
        assert.equal(success.isError, undefined);
        assert.equal(successBody.outcome, 'ok');
        assert.equal(successBody.outcome_kind, 'success');
        assert.equal(successBody.is_error, false);

        const invalid = await handleForgeHostComplete({}, undefined, { db: recorded.db });
        const invalidBody = responseBody(invalid);
        assert.equal(invalid.isError, undefined);
        assert.equal(invalidBody.outcome, 'guardrail_block');
        assert.equal(invalidBody.outcome_kind, 'guardrail');
        assert.equal(invalidBody.is_error, false);

        const unknown = fixture();
        unknown.db.prepare("UPDATE hall_forge_attempts SET status = 'UNKNOWN' WHERE attempt_id = ?").run(unknown.attemptId);
        const lifecycle = await handleForgeHostComplete(unknown.input, undefined, { db: unknown.db });
        const lifecycleBody = responseBody(lifecycle);
        assert.equal(lifecycle.isError, undefined);
        assert.equal(lifecycleBody.outcome, 'domain_terminal');
        assert.equal(lifecycleBody.outcome_kind, 'domain');
        assert.equal(lifecycleBody.is_error, false);
        assert.equal(lifecycleBody.error_code, 'forge_host_completion_unknown_attempt');
    });
});
