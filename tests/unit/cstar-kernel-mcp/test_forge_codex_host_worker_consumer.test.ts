import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    consumeForgeCodexHostWorkerHandoff,
} from '../../../src/tools/pennyone/intel/forge_host_worker_consumer.js';
import {
    forgeCodexHostWorkerHandoffPath,
    persistForgeCodexHostWorkerHandoff,
} from '../../../src/tools/pennyone/intel/forge_host_worker_dispatch.js';
import { captureForgeHostPathIdentities } from '../../../src/tools/pennyone/intel/forge_host_path_identity.js';
import type { CodexHostWorkerJobContract } from '../../../src/types/worker_job.js';

const roots: string[] = [];

function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, stable(item)]));
    }
    return value;
}

function stableJson(value: unknown): string {
    return JSON.stringify(stable(value));
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

function fixture(overrides: Record<string, unknown> = {}): {
    root: string;
    project: string;
    target: string;
    output: string;
    job: CodexHostWorkerJobContract;
} {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-host-consumer-'));
    roots.push(root);
    fs.chmodSync(root, 0o700);
    const project = path.join(root, 'project');
    const sourceDirectory = path.join(project, 'src');
    const target = path.join(sourceDirectory, 'worker.ts');
    const output = path.join(sourceDirectory, 'output.ts');
    fs.mkdirSync(sourceDirectory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, 'export const worker = true;\n', { mode: 0o600 });
    const targetPaths = [target];
    const outputPaths = [output];
    const scopeSha256 = sha256(JSON.stringify(targetPaths));
    const canonicalRequestId = 'dispatch-forge-consumer';
    const idempotencyKey = 'consumer-key-001';
    const executionReceiptId = `forge-execute-${sha256(`${canonicalRequestId}\n${idempotencyKey}`).slice(0, 32)}`;
    const now = Date.now();
    const base = {
        schema: 'cstar.codex_host_worker_job.v2',
        worker_kind: 'forge',
        workflow_surface: 'forge',
        bead_id: 'bead:test:consumer',
        decision_id: 'decision:test:consumer',
        canonical_request_id: canonicalRequestId,
        canonical_request_sha256: 'a'.repeat(64),
        authorization_id: 'authorization:test:consumer',
        authorization_expires_at: now + 60_000,
        runner_owner: 'codex-host',
        requested_model: 'gpt-5.6-luna',
        requested_reasoning: 'max',
        selector_status: 'enforced',
        actual_identity: null,
        transport: 'codex-host',
        cognition_launch: false,
        cstar_launch: false,
        provider_requests_started: 0,
        spend_uncertain: false,
        known_spend_observed: false,
        network_accessed: false,
        idempotency_key: idempotencyKey,
        execution_deadline_at: now + 50_000,
        attempt_id: 'attempt:test:consumer',
        objective: 'Consume one bounded host handoff.',
        expected_artifacts: [{ name: 'handoff', artifact_kind: 'other', required: true }],
        job_id: 'codex-host-job-consumer',
        host_launch_required: true,
        project_root: project,
        target_paths: targetPaths,
        output_paths: outputPaths,
        target_paths_sha256: scopeSha256,
        path_identity_bindings: captureForgeHostPathIdentities(targetPaths, outputPaths),
        validation_ticket_binding: {
            schema: 'cstar.validation_ticket_binding.v1',
            repository_id: 'repo:test:consumer',
            bead_id: 'bead:test:consumer',
            execution_receipt_id: executionReceiptId,
            attempt_id: 'attempt:test:consumer',
            scope_sha256: scopeSha256,
            one_use: true,
        },
        validation_ticket_request: {
            schema: 'cstar.validation_ticket_request.v1',
            repository_id: 'repo:test:consumer',
            bead_id: 'bead:test:consumer',
            execution_receipt_id: executionReceiptId,
            attempt_id: 'attempt:test:consumer',
            scope_sha256: scopeSha256,
            one_use: true,
            expires_at: now + 40_000,
        },
        ...overrides,
    };
    return { root, project, target, output, job: {
        ...base,
        dispatch_receipt_sha256: sha256(stableJson(base)),
    } as CodexHostWorkerJobContract };
}

function consumeInput(root: string, job: CodexHostWorkerJobContract) {
    const executionReceiptId = job.validation_ticket_binding!.execution_receipt_id;
    const handoffPath = forgeCodexHostWorkerHandoffPath(root, `forge-execute-${sha256(`${job.canonical_request_id}\n${job.idempotency_key}`).slice(0, 32)}`);
    const persisted = persistForgeCodexHostWorkerHandoff(root, job);
    assert.equal(persisted.handoff.handoff_path, handoffPath);
    return {
        handoffPath,
        expectedHandoffSha256: persisted.handoff.handoff_sha256,
        expectedRequestId: job.canonical_request_id,
        expectedRequestSha256: job.canonical_request_sha256,
        expectedExecutionReceiptId: executionReceiptId,
        expectedAttemptId: job.attempt_id,
        expectedScopeSha256: job.target_paths_sha256,
        controlRoot: root,
    };
}

afterEach(() => {
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('post-return Codex-host Forge handoff consumer', () => {
    it('reads a queued handoff and exposes only a final-identity-revalidated job', () => {
        const item = fixture();
        const result = consumeForgeCodexHostWorkerHandoff(consumeInput(item.root, item.job));
        assert.equal(result.receipt.schema, 'cstar.forge_codex_host_worker_consumption_receipt.v1');
        assert.equal(result.receipt.status, 'ready_for_host_execution');
        assert.equal(result.receipt.path_identity_revalidated, true);
        assert.equal(result.receipt.requested_model, 'gpt-5.6-luna');
        assert.equal(result.receipt.requested_reasoning, 'max');
        assert.equal(result.receipt.actual_identity, null);
        assert.equal(result.job.job_id, item.job.job_id);
    });

    it('accepts a persisted queued status when the host received a replay projection', () => {
        const item = fixture();
        const input = consumeInput(item.root, item.job);
        const result = consumeForgeCodexHostWorkerHandoff(input);
        assert.equal(result.receipt.handoff_sha256, input.expectedHandoffSha256);
    });

    it('accepts owner-controlled 0755 control parents with a private execution and handoff', () => {
        const item = fixture();
        const input = consumeInput(item.root, item.job);
        const workDirectory = path.join(item.root, 'work');
        const forgeExecutionsDirectory = path.join(workDirectory, 'forge-executions');
        const executionDirectory = path.dirname(input.handoffPath);
        for (const directory of [item.root, workDirectory, forgeExecutionsDirectory]) {
            fs.chmodSync(directory, 0o755);
        }
        fs.chmodSync(executionDirectory, 0o700);
        fs.chmodSync(input.handoffPath, 0o600);

        const result = consumeForgeCodexHostWorkerHandoff(input);
        assert.equal(result.receipt.status, 'ready_for_host_execution');
    });

    it('rejects group- or world-writable control directories', () => {
        for (const mode of [0o775, 0o757]) {
            const item = fixture();
            const input = consumeInput(item.root, item.job);
            const workDirectory = path.join(item.root, 'work');
            fs.chmodSync(workDirectory, mode);
            try {
                assert.throws(
                    () => consumeForgeCodexHostWorkerHandoff(input),
                    /forge_codex_host_handoff_mode/,
                );
            } finally {
                fs.chmodSync(workDirectory, 0o700);
            }
        }
    });

    it('requires the trusted CStar return binding and rejects request, receipt, attempt, or scope drift', () => {
        const item = fixture();
        const input = consumeInput(item.root, item.job);
        for (const drift of [
            { expectedRequestId: 'dispatch-forge-other' },
            { expectedRequestSha256: 'b'.repeat(64) },
            { expectedExecutionReceiptId: 'forge-execute-other' },
            { expectedAttemptId: 'attempt:test:other' },
            { expectedScopeSha256: 'c'.repeat(64) },
        ]) {
            assert.throws(
                () => consumeForgeCodexHostWorkerHandoff({ ...input, ...drift }),
                /forge_codex_host_handoff_binding_mismatch|forge_codex_host_handoff_path_mismatch/,
            );
        }
        assert.throws(
            () => consumeForgeCodexHostWorkerHandoff({ handoffPath: input.handoffPath }),
            /forge_codex_host_consumer_binding_missing/,
        );
    });

    it('rejects unsafe handoff type, hardlink count, mode, and symlink substitution', () => {
        const unsafe = (mutate: (handoffPath: string, root: string) => void, code: RegExp) => {
            const item = fixture();
            const input = consumeInput(item.root, item.job);
            mutate(input.handoffPath, item.root);
            assert.throws(() => consumeForgeCodexHostWorkerHandoff(input), code);
        };
        unsafe((handoffPath) => fs.chmodSync(handoffPath, 0o640), /forge_codex_host_handoff_mode/);
        unsafe((handoffPath, root) => fs.linkSync(handoffPath, path.join(root, 'handoff-hardlink')), /forge_codex_host_handoff_link_count/);
        unsafe((handoffPath) => {
            fs.unlinkSync(handoffPath);
            fs.mkdirSync(handoffPath);
        }, /forge_codex_host_handoff_unsafe_type/);
        unsafe((handoffPath, root) => {
            const outside = path.join(root, 'outside.json');
            fs.writeFileSync(outside, '{}', { mode: 0o600 });
            fs.unlinkSync(handoffPath);
            fs.symlinkSync(outside, handoffPath);
        }, /forge_codex_host_handoff_symlink_forbidden/);
    });

    it('rejects malformed and hash-drifted durable bytes without exposing a job', () => {
        const malformed = fixture();
        const malformedInput = consumeInput(malformed.root, malformed.job);
        fs.writeFileSync(malformedInput.handoffPath, '{not-json\n');
        assert.throws(() => consumeForgeCodexHostWorkerHandoff(malformedInput), /forge_codex_host_handoff_malformed/);

        const drifted = fixture();
        const driftedInput = consumeInput(drifted.root, drifted.job);
        const value = JSON.parse(fs.readFileSync(driftedInput.handoffPath, 'utf8')) as Record<string, unknown>;
        value.handoff_sha256 = 'f'.repeat(64);
        fs.writeFileSync(driftedInput.handoffPath, `${JSON.stringify(value)}\n`);
        assert.throws(() => consumeForgeCodexHostWorkerHandoff(driftedInput), /forge_codex_host_handoff_hash_mismatch/);
    });

    it('rejects target and output identity replacement after publication', () => {
        const hardlinked = fixture();
        const hardlinkInput = consumeInput(hardlinked.root, hardlinked.job);
        const outside = path.join(hardlinked.root, 'outside.ts');
        fs.writeFileSync(outside, 'outside\n', { mode: 0o600 });
        fs.unlinkSync(hardlinked.target);
        fs.linkSync(outside, hardlinked.target);
        assert.throws(() => consumeForgeCodexHostWorkerHandoff(hardlinkInput), /forge_codex_host_path_identity_drift/);

        const symlinked = fixture();
        const symlinkInput = consumeInput(symlinked.root, symlinked.job);
        fs.symlinkSync(symlinked.target, symlinked.output);
        assert.throws(() => consumeForgeCodexHostWorkerHandoff(symlinkInput), /forge_codex_host_path_identity_drift/);

        const created = fixture();
        const createdInput = consumeInput(created.root, created.job);
        fs.writeFileSync(created.output, 'created too early\n', { mode: 0o600 });
        assert.throws(() => consumeForgeCodexHostWorkerHandoff(createdInput), /forge_codex_host_path_identity_drift/);
    });

    it('rejects target parent replacement and keeps the durable handoff untouched', () => {
        const item = fixture();
        const input = consumeInput(item.root, item.job);
        const sourceDirectory = path.dirname(item.target);
        const movedDirectory = path.join(item.root, 'moved-src');
        fs.renameSync(sourceDirectory, movedDirectory);
        fs.mkdirSync(sourceDirectory, { mode: 0o700 });
        fs.writeFileSync(item.target, 'replacement\n', { mode: 0o600 });
        const before = fs.statSync(input.handoffPath);
        assert.throws(() => consumeForgeCodexHostWorkerHandoff(input), /forge_codex_host_path_identity_drift/);
        const after = fs.statSync(input.handoffPath);
        assert.equal(after.ino, before.ino);
        assert.equal(after.nlink, 1);
    });

    it('keeps the current v3 Codex-host policy and does not consume lifecycle authority', () => {
        const source = fs.readFileSync(
            path.resolve('scripts/consume_codex_host_worker_handoff.ts'),
            'utf8',
        );
        assert.match(source, /consumeForgeCodexHostWorkerHandoff/);
        assert.match(source, /executable_job: null/);
        assert.doesNotMatch(source, /cstar_record_result|cstar_forge_execute|Hall|SQLite/);
    });
});
