import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    closeDb,
    database,
    getHallBead,
    saveHallValidationRun,
    upsertHallBead,
} from '../../src/tools/pennyone/intel/database.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../src/types/hall.js';
import type { HallValidationEvidenceManifest } from '../../src/types/hall.js';
import { hashValidationEvidenceManifest } from '../../src/types/validation_evidence.js';
import { handleBead as handleMonolithBead } from '../../src/tools/cstar-kernel-mcp.js';
import { handleBead as handleModularBead } from '../../src/tools/cstar-kernel-mcp/tools/bead.js';
import {
    authorizeForgeRequest,
    saveForgeRequest,
} from '../../src/tools/pennyone/intel/forge_request_authorization_controller.js';
import { markForgeAttemptStarted, reserveForgeAttempt } from '../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { recordForgeDelivery, resolveForgeValidationSubject } from '../../src/tools/pennyone/intel/forge_validation_controller.js';
import {
    cleanupOperatorAuthorizationFixtures,
    createSession,
    validRequestContext,
} from './cstar-kernel-mcp/operator_authorization_test_support.js';

function parseToolResult(result: { content: Array<{ text: string }> }): any {
    return JSON.parse(result.content[0].text);
}

describe('Bead controller SQLite persistence', () => {
    let tmpRoot: string;
    let previousRoot: string;
    let previousNodeTestContext: string | undefined;
    let mutationContext: ReturnType<typeof validRequestContext>;

    beforeEach(() => {
        previousRoot = registry.getRoot();
        tmpRoot = fs.mkdtempSync(path.join(process.platform === 'linux' ? '/tmp' : os.tmpdir(), 'cstar-bead-persist-'));
        previousNodeTestContext = process.env.NODE_TEST_CONTEXT;
        process.env.NODE_TEST_CONTEXT = 'cstar-synthetic';
        const session = createSession({ textParts: ['Synthetic bead persistence mutation.'] });
        mutationContext = validRequestContext(session.threadId, session.turnId);
        registry.setRoot(tmpRoot);
        closeDb();
    });

    afterEach(() => {
        closeDb();
        registry.setRoot(previousRoot);
        if (previousNodeTestContext === undefined) delete process.env.NODE_TEST_CONTEXT;
        else process.env.NODE_TEST_CONTEXT = previousNodeTestContext;
        cleanupOperatorAuthorizationFixtures();
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    function sterlingEvidence(beadId: string, validationId: string) {
        const suffix = createHash('sha256').update(beadId).digest('hex').slice(0, 12);
        const loreRelative = `tests/features/sterling-${suffix}.feature`;
        const isolationRelative = `tests/unit/sterling-${suffix}.test.ts`;
        const checkRelative = `work/evidence/sterling-${suffix}.txt`;
        const write = (relative: string, content: string) => {
            const absolute = path.join(tmpRoot, relative);
            fs.mkdirSync(path.dirname(absolute), { recursive: true });
            fs.writeFileSync(absolute, content, { mode: 0o600 });
            return absolute;
        };
        const lorePath = write(loreRelative, [
            'Feature: Synthetic bead persistence validation',
            '  Scenario: Exact receipt',
            '    Given bounded evidence',
            '    Then the bead may resolve',
            '',
        ].join('\n'));
        const isolationPath = write(isolationRelative, 'export const focused = true;\n');
        const checkPath = write(checkRelative, 'focused validation passed\n');
        const sha256 = (filePath: string) => createHash('sha256')
            .update(fs.readFileSync(filePath))
            .digest('hex');
        const db = database.getWritableDb(tmpRoot);
        const id = randomUUID().replaceAll('-', '');
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
        const requestId = `dispatch-forge-${id}`;
        const requestSha = 'a'.repeat(64);
        const now = Date.now();
        saveForgeRequest(db, {
            request_id: requestId,
            repo_id: repoId,
            bead_id: beadId,
            decision_id: `decision-${id}`,
            request_sha256: requestSha,
            request_summary_json: JSON.stringify({
                schema: 'cstar.forge_request.v3',
                required_output_paths: [],
            }),
            adapter_ref: 'cstar-forge-hermes-minimax-adapter',
            write_capability: 'response_only',
            target_paths_sha256: 'b'.repeat(64),
            live_source_allowed: false,
            max_attempts: 1,
            requester_thread_id: randomUUID(),
            requester_turn_id: randomUUID(),
            requester_record_set_sha256: 'c'.repeat(64),
            authorization_profile: 'exact_request_challenge_v1',
            authorization_challenge_sha256: 'd'.repeat(64),
            now,
        });
        const authorization = authorizeForgeRequest(db, {
            request_id: requestId,
            request_sha256: requestSha,
            authorization_profile: 'exact_request_challenge_v1',
            challenge_sha256: 'd'.repeat(64),
            operator_authorization_ref: `test:${id}`,
            operator_thread_id: randomUUID(),
            operator_turn_id: randomUUID(),
            operator_message_sha256: 'e'.repeat(64),
            operator_record_sha256: 'f'.repeat(64),
            operator_record_set_sha256: '1'.repeat(64),
            operator_record_count: 1,
            authorized_at: now,
            expires_at: now + 60_000,
            now,
        }).authorization;
        const attempt = reserveForgeAttempt(db, {
            request_id: requestId,
            authorization_id: authorization.authorization_id,
            idempotency_key: `sterling-${id}`,
            execution_receipt_id: `forge-execute-${id}`,
            adapter_ref: 'cstar-forge-hermes-minimax-adapter',
            adapter_version: 'synthetic-v2',
            now,
        }).attempt;
        markForgeAttemptStarted(db, attempt.attempt_id, now);
        const deliveryPath = write(`work/evidence/delivery-${id}.json`, '{"status":"pass"}\n');
        recordForgeDelivery(db, {
            attempt_id: attempt.attempt_id,
            result_status: 'synthetic',
            result_artifact_sha256: sha256(deliveryPath),
            adapter_version: 'synthetic-v2',
            now,
        });
        const subject = resolveForgeValidationSubject(db, {
            execution_receipt_id: attempt.execution_receipt_id,
            repository_id: repoId,
            bead_id: beadId,
        }).subject;
        const validatorThread = `validator-${id}`;
        const validatorTurn = `validator-turn-${id}`;
        const manifest: HallValidationEvidenceManifest = {
            schema: 'cstar.validation-evidence.v2',
            validator_identity: `codex-thread:${validatorThread}:turn:${validatorTurn}`,
            validator_identity_source: 'test_fixture',
            request_thread_id: validatorThread,
            request_turn_id: validatorTurn,
            subject: {
                repository_id: subject.repository_id,
                bead_id: subject.bead_id,
                work_receipt_kind: subject.work_receipt_kind,
                work_receipt_id: subject.work_receipt_id,
                forge_request_id: subject.forge_request_id,
                forge_request_sha256: subject.forge_request_sha256,
                decision_id: subject.decision_id,
                target_paths_sha256: subject.target_paths_sha256,
                attempt_id: subject.attempt_id,
                result_artifact_sha256: subject.result_artifact_sha256,
                adapter_ref: subject.adapter_ref,
                adapter_version: subject.adapter_version,
                external_execution_id: subject.external_execution_id,
            },
            independence: {
                policy: 'distinct_codex_root_thread_from_forge_requester_and_executor_v1',
                validator_thread_id: validatorThread,
                requester_thread_id: subject.requester_thread_id,
                requester_turn_id: subject.requester_turn_id,
                requester_record_set_sha256: subject.requester_record_set_sha256,
                executor_binding: 'forge_exact_authorizing_turn_v1',
                authorization_id: subject.authorization_id,
                executor_thread_id: subject.executor_thread_id,
                executor_turn_id: subject.executor_turn_id,
                executor_record_sha256: subject.executor_record_sha256,
                executor_record_set_sha256: subject.executor_record_set_sha256,
                executor_record_count: subject.executor_record_count,
            },
            artifacts: [lorePath, isolationPath, deliveryPath].map((artifactPath) => ({
                path: artifactPath,
                sha256: sha256(artifactPath),
            })),
            checks: [{
                name: 'focused synthetic validation',
                status: 'pass',
                evidence_path: checkPath,
                sha256: sha256(checkPath),
            }],
        };
        saveHallValidationRun({
            validation_id: validationId,
            repo_id: buildHallRepositoryId(normalizeHallPath(tmpRoot)),
            bead_id: beadId,
            verdict: 'ACCEPTED',
            authority_class: 'verified_v2',
            validator_identity: manifest.validator_identity,
            validator_identity_source: manifest.validator_identity_source,
            evidence_manifest: manifest,
            evidence_sha256: hashValidationEvidenceManifest(manifest),
            created_at: Date.now(),
        });
        return {
            lore_paths: [loreRelative],
            isolation_paths: [isolationRelative],
            audit: { validation_id: validationId },
        };
    }

    it('persists resolved validation ids through real Hall conflict updates', () => {
        const repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));

        upsertHallBead({
            bead_id: 'bead:test-validation-persistence',
            repo_id: repoId,
            rationale: 'Create bead before validation exists.',
            status: 'OPEN',
            created_at: 1000,
            updated_at: 1000,
        });

        upsertHallBead({
            bead_id: 'bead:test-validation-persistence',
            repo_id: repoId,
            rationale: 'Resolve bead with validation evidence.',
            status: 'RESOLVED',
            resolution_note: 'Validated through focused regression test.',
            resolved_validation_id: 'val-test-123',
            created_at: 1000,
            updated_at: 2000,
        });

        const resolved = getHallBead('bead:test-validation-persistence');
        assert.ok(resolved, 'resolved bead should be readable from Hall');
        assert.equal(resolved.status, 'RESOLVED');
        assert.equal(resolved.resolved_validation_id, 'val-test-123');

        upsertHallBead({
            bead_id: 'bead:test-validation-persistence',
            repo_id: repoId,
            rationale: 'Follow-up metadata update must not erase the validation link.',
            status: 'RESOLVED',
            created_at: 1000,
            updated_at: 3000,
        });

        const afterFollowUp = getHallBead('bead:test-validation-persistence');
        assert.equal(afterFollowUp?.resolved_validation_id, 'val-test-123');
    });

    for (const [label, handleBead] of [
        ['monolith', handleMonolithBead],
        ['modular', handleModularBead],
    ] as const) {
        it(`reads back resolved validation ids through real Hall handler path (${label})`, async () => {
            const beadId = `bead:test-handler-validation-persistence:${label}`;

            const createResult = parseToolResult(await handleBead({
                action: 'create',
                bead_id: beadId,
                rationale: `Create ${label} handler bead before validation exists.`,
                target_kind: 'VALIDATION',
                target_path: 'src/tools/cstar-kernel-mcp.ts',
            }, mutationContext));
            assert.equal(createResult.status, 'created');

            const validationId = `val-handler-${label}`;

            const resolveResult = parseToolResult(await handleBead({
                action: 'resolve',
                bead_id: beadId,
                resolution_note: 'Resolved after focused handler verification.',
                resolved_validation_id: validationId,
                mandate_evidence: sterlingEvidence(beadId, validationId),
            }, mutationContext));
            assert.equal(resolveResult.status, 'resolved');
            assert.equal(resolveResult.bead.status, 'RESOLVED');
            assert.equal(resolveResult.bead.resolved_validation_id, `val-handler-${label}`);

            const getResult = parseToolResult(await handleBead({
                action: 'get',
                bead_id: beadId,
            }, mutationContext));
            assert.equal(getResult.status, 'ok');
            assert.equal(getResult.bead.status, 'RESOLVED');
            assert.equal(getResult.bead.resolved_validation_id, `val-handler-${label}`);

            const listResult = parseToolResult(await handleBead({
                action: 'list',
                statuses: ['RESOLVED'],
            }, mutationContext));
            const listed = listResult.beads.find((bead: any) => bead.bead_id === beadId);
            assert.ok(listed, 'resolved bead should appear in list output');
            assert.equal(listed.resolved_validation_id, `val-handler-${label}`);

            const stored = getHallBead(beadId);
            assert.equal(stored?.metadata?.resolved_validation_id, `val-handler-${label}`);
            assert.equal((stored?.metadata?.resolution as any)?.validation_id, `val-handler-${label}`);
        });

        it(`reads back validation_id alias through real Hall handler path (${label})`, async () => {
            const beadId = `bead:test-handler-validation-alias:${label}`;

            await handleBead({
                action: 'create',
                bead_id: beadId,
                rationale: `Create ${label} handler bead for bridge-safe validation alias.`,
                target_kind: 'VALIDATION',
                target_path: 'src/tools/cstar-kernel-mcp.ts',
            }, mutationContext);

            const validationId = `val-handler-alias-${label}`;

            const resolveResult = parseToolResult(await handleBead({
                action: 'resolve',
                bead_id: beadId,
                resolution_note: 'Resolved through bridge-safe validation_id alias.',
                validation_id: validationId,
                mandate_evidence: sterlingEvidence(beadId, validationId),
            }, mutationContext));
            assert.equal(resolveResult.status, 'resolved');
            assert.equal(resolveResult.bead.status, 'RESOLVED');
            assert.equal(resolveResult.bead.resolved_validation_id, `val-handler-alias-${label}`);

            const getResult = parseToolResult(await handleBead({
                action: 'get',
                bead_id: beadId,
            }, mutationContext));
            assert.equal(getResult.bead.resolved_validation_id, `val-handler-alias-${label}`);

            const stored = getHallBead(beadId);
            assert.equal(stored?.resolved_validation_id, `val-handler-alias-${label}`);
            assert.equal(stored?.metadata?.resolved_validation_id, `val-handler-alias-${label}`);
            assert.equal((stored?.metadata?.resolution as any)?.validation_id, `val-handler-alias-${label}`);
        });
    }
});
