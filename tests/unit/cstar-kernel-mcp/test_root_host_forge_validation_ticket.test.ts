import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { handleRecordResult } from '../../../src/tools/cstar-kernel-mcp/tools/result.js';
import { database } from '../../../src/tools/pennyone/intel/database.js';
import {
    markForgeAttemptStarted,
    reserveForgeAttempt,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { recordForgeDelivery } from '../../../src/tools/pennyone/intel/forge_validation_controller.js';
import { issueIndependentValidatorTicket } from '../../../src/tools/pennyone/intel/validation_ticket_controller.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import {
    forgeRequestInput,
    saveAndAuthorizeForgeRequest,
} from './forge_receipt_test_support.js';
import {
    cleanupOperatorAuthorizationFixtures,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';
import { createHostReceipt } from './validation_ticket_test_helpers.js';

const originalRoot = registry.getRoot();
const originalTestMode = process.env.CSTAR_FORGE_TEST_MODE;
const originalNodeTestContext = process.env.NODE_TEST_CONTEXT;
const roots: string[] = [];
const SCOPE_SHA256 = 'e'.repeat(64);
const VALIDATOR_THREAD = '019f0000-0000-7000-8000-000000000501';
const VALIDATOR_TURN = '019f0000-0000-7000-8000-000000000502';
interface ParsedResult extends Record<string, unknown> {
    status?: string;
    validation_authority?: string;
    validation_persisted?: boolean;
    forge_validation_warning?: string;
    outcome?: string;
    error_code?: string;
    forge_validation?: { accepted?: boolean; attempt_status?: string };
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function fixture() {
    const root = fs.mkdtempSync(path.join(process.platform === 'linux' ? '/tmp' : os.tmpdir(), 'cstar-root-host-ticket-'));
    roots.push(root);
    registry.setRoot(root);
    process.env.CSTAR_FORGE_TEST_MODE = '1';
    process.env.NODE_TEST_CONTEXT = 'cstar-synthetic';
    const recorder = createSession({ textParts: ['Record the bounded independent Forge validation.'] });
    const db = database.getWritableDb(root);
    const repoId = buildHallRepositoryId(normalizeHallPath(root));
    const now = Date.now();
    db.prepare(`
        INSERT OR IGNORE INTO hall_repositories (
            repo_id, root_path, name, status, active_persona,
            baseline_gungnir_score, intent_integrity, created_at, updated_at
        ) VALUES (?, ?, 'Root host validation fixture', 'DORMANT', '', 0, 0, ?, ?)
    `).run(repoId, normalizeHallPath(root), now, now);
    const suffix = randomUUID().replaceAll('-', '');
    const beadId = `bead:test:root-host-forge-${suffix}`;
    const targetPath = path.join(root, 'target.ts');
    db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, target_kind, target_path, rationale,
            status, created_at, updated_at
        ) VALUES (?, ?, 'FILE', ?, 'Root host Forge bridge fixture', 'IN_PROGRESS', ?, ?)
    `).run(beadId, repoId, targetPath, now, now);
    const request = forgeRequestInput(repoId, beadId, {
        request_summary_json: JSON.stringify({
            schema: 'cstar.forge_request.v3',
            required_output_paths: [],
        }),
        target_paths_sha256: SCOPE_SHA256,
        now,
    });
    const authorization = saveAndAuthorizeForgeRequest(db, request).authorization;
    const attempt = reserveForgeAttempt(db, {
        request_id: request.request_id,
        authorization_id: authorization.authorization_id,
        idempotency_key: `root-host-${suffix}`,
        execution_receipt_id: `forge-execute-${suffix}`,
        adapter_ref: request.adapter_ref ?? '',
    }).attempt;
    markForgeAttemptStarted(db, attempt.attempt_id, now);
    const evidencePath = path.join(root, 'evidence', 'validation.txt');
    const evidenceContent = `root host Forge evidence ${suffix}\n`;
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, evidenceContent, { mode: 0o600 });
    const evidenceSha = sha256(evidenceContent);
    recordForgeDelivery(db, {
        attempt_id: attempt.attempt_id,
        result_status: 'synthetic-delivery',
        result_artifact_sha256: evidenceSha,
        external_execution_id: `external-${suffix}`,
        now,
    });
    return {
        root, repositoryRoot: root, db, repoId, beadId, attempt, evidencePath, evidenceSha, now,
        recorderThreadId: recorder.threadId,
        recorderTurnId: recorder.turnId,
        recorderSessionFile: recorder.sessionFile,
        requestContext: validRequestContext(recorder.threadId, recorder.turnId),
    };
}

function issueTicket(
    value: ReturnType<typeof fixture>,
    validatorThreadId = VALIDATOR_THREAD,
    validatorTurnId = VALIDATOR_TURN,
) {
    return issueIndependentValidatorTicket(value.db, {
        repository_id: value.repoId,
        bead_id: value.beadId,
        execution_receipt_id: value.attempt.execution_receipt_id,
        attempt_id: value.attempt.attempt_id,
        scope_sha256: SCOPE_SHA256,
        validator_thread_id: validatorThreadId,
        validator_turn_id: validatorTurnId,
        now: value.now,
        expires_at: value.now + 60_000,
    });
}

function parse(result: { content: Array<{ text: string }> }): ParsedResult {
    return JSON.parse(result.content[0]?.text ?? '{}') as ParsedResult;
}

function record(
    value: ReturnType<typeof fixture>,
    validationId: string,
    receipt: ReturnType<typeof createHostReceipt>,
    validationTicket?: string,
    requestContext = value.requestContext,
) {
    return handleRecordResult({
        bead_id: value.beadId,
        verdict: 'ACCEPTED',
        validation_id: validationId,
        forge_execution_receipt_id: value.attempt.execution_receipt_id,
        host_validation_receipt: receipt,
        validation_ticket: validationTicket,
    }, requestContext);
}

afterEach(() => {
    database.close();
    registry.setRoot(originalRoot);
    if (originalTestMode === undefined) delete process.env.CSTAR_FORGE_TEST_MODE;
    else process.env.CSTAR_FORGE_TEST_MODE = originalTestMode;
    if (originalNodeTestContext === undefined) delete process.env.NODE_TEST_CONTEXT;
    else process.env.NODE_TEST_CONTEXT = originalNodeTestContext;
    cleanupOperatorAuthorizationFixtures();
    while (roots.length) fs.rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe('root host validation receipt composes with one-use Forge ticket', () => {
    it('persists verified_v3 and accepts the exact pending Forge delivery', async () => {
        const value = fixture();
        const validationId = 'validation-root-host-success';
        const receipt = createHostReceipt(value, validationId, VALIDATOR_THREAD, VALIDATOR_TURN);
        const ticket = issueTicket(value);
        const result = parse(await record(value, validationId, receipt, ticket.ticket));

        assert.equal(result.status, 'recorded_verified', JSON.stringify(result));
        assert.equal(result.validation_authority, 'verified_v3');
        assert.equal(result.forge_validation?.accepted, true);
        assert.equal(result.forge_validation?.attempt_status, 'SUCCEEDED');
        const validation = value.db.prepare(`
            SELECT authority_class, verdict FROM hall_validation_runs WHERE validation_id = ?
        `).get(validationId) as Record<string, unknown>;
        assert.deepEqual(validation, { authority_class: 'verified_v3', verdict: 'ACCEPTED' });
        const consumed = value.db.prepare(`
            SELECT consumed_validation_id FROM hall_forge_validation_tickets WHERE ticket_id = ?
        `).get(ticket.ticket_id) as Record<string, unknown>;
        assert.equal(consumed.consumed_validation_id, validationId);
    });

    it('rolls back ticket, validation, and Forge state on validator mismatch', async () => {
        const value = fixture();
        const validationId = 'validation-root-host-mismatch';
        const receipt = createHostReceipt(value, validationId, VALIDATOR_THREAD, VALIDATOR_TURN);
        const ticket = issueTicket(value, `${VALIDATOR_THREAD}-wrong`, `${VALIDATOR_TURN}-wrong`);
        const result = parse(await record(value, validationId, receipt, ticket.ticket));

        assert.equal(result.validation_persisted, false);
        assert.equal(result.forge_validation_warning, 'validation_ticket_validator_mismatch');
        assert.equal(value.db.prepare(
            'SELECT validation_id FROM hall_validation_runs WHERE validation_id = ?',
        ).get(validationId), undefined);
        assert.equal(value.db.prepare(
            'SELECT consumed_at FROM hall_forge_validation_tickets WHERE ticket_id = ?',
        ).get(ticket.ticket_id)?.consumed_at, null);
        assert.equal(value.db.prepare(
            'SELECT status FROM hall_forge_attempts WHERE attempt_id = ?',
        ).get(value.attempt.attempt_id)?.status, 'STARTED');
    });

    it('does not persist or promote positive host evidence without a ticket', async () => {
        const value = fixture();
        const validationId = 'validation-root-host-missing-ticket';
        const receipt = createHostReceipt(value, validationId, VALIDATOR_THREAD, VALIDATOR_TURN);
        const result = parse(await record(value, validationId, receipt));

        assert.equal(result.validation_persisted, false);
        assert.equal(result.forge_validation_warning, 'validation_ticket_required');
        assert.equal(value.db.prepare(
            'SELECT validation_id FROM hall_validation_runs WHERE validation_id = ?',
        ).get(validationId), undefined);
        assert.equal(value.db.prepare(
            'SELECT status FROM hall_forge_attempts WHERE attempt_id = ?',
        ).get(value.attempt.attempt_id)?.status, 'STARTED');
    });

    it('cannot consume the ticket or finalize the Forge delivery twice', async () => {
        const value = fixture();
        const validationId = 'validation-root-host-replay';
        const receipt = createHostReceipt(value, validationId, VALIDATOR_THREAD, VALIDATOR_TURN);
        const ticket = issueTicket(value);
        const first = parse(await record(value, validationId, receipt, ticket.ticket));
        const replay = parse(await record(value, validationId, receipt, ticket.ticket));

        assert.equal(first.forge_validation?.attempt_status, 'SUCCEEDED');
        assert.equal(replay.validation_persisted, false);
        assert.equal(replay.forge_validation_warning, 'validation_ticket_replayed');
        assert.equal(value.db.prepare(
            'SELECT COUNT(*) AS count FROM hall_validation_runs WHERE validation_id = ?',
        ).get(validationId)?.count, 1);
        assert.equal(value.db.prepare(
            'SELECT status, validation_id FROM hall_forge_attempts WHERE attempt_id = ?',
        ).get(value.attempt.attempt_id)?.validation_id, validationId);
    });

    it('keeps ordinary subagent cstar_record_result ingress rejected', async () => {
        const value = fixture();
        const validationId = 'validation-root-host-subagent-rejected';
        const receipt = createHostReceipt(value, validationId, VALIDATOR_THREAD, VALIDATOR_TURN);
        const subagent = createSession({
            textParts: ['Attempt an unauthorized subagent result mutation.'],
            sessionMeta: {
                thread_source: 'subagent',
                parent_thread_id: value.recorderThreadId,
                forked_from_id: value.recorderThreadId,
                agent_path: '/root/validator',
            },
        });
        const result = parse(await record(
            value,
            validationId,
            receipt,
            undefined,
            validRequestContext(subagent.threadId, subagent.turnId, {
                thread_source: 'subagent',
                parent_thread_id: value.recorderThreadId,
                forked_from_thread_id: value.recorderThreadId,
                subagent_kind: 'review',
            }),
        ));

        assert.equal(result.outcome, 'guardrail_block');
        assert.match(String(result.error_code), /^codex_request_identity_/);
        assert.equal(value.db.prepare(
            'SELECT validation_id FROM hall_validation_runs WHERE validation_id = ?',
        ).get(validationId), undefined);
    });
});
