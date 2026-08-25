import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { afterEach, describe, it } from 'node:test';

import {
    buildForgeRequestId,
    canonicalizeForgeRequest,
    hashCanonicalForgeRequest,
    hashForgeTargetPaths,
    stableJson,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_request_contract.js';
import {
    verifyCodexRequestIdentity,
} from '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import { resolveForgeOperatorWorkItem } from '../../../src/tools/cstar-kernel-mcp/tools/forge_operator_work_item_resolution.js';
import {
    buildForgeRootRepairContinuationIntent,
    ensureForgeRootRepairBindingSchema,
    getForgeRootRepairBinding,
    assertForgeRootRepairContinuationAuthorization,
} from '../../../src/tools/pennyone/intel/forge_request_root_repair_binding.js';
import {
    authorizeForgeRequest,
    saveForgeRequest,
    type AuthorizeForgeRequestInput,
    type SaveForgeRequestInput,
} from '../../../src/tools/pennyone/intel/forge_request_authorization_controller.js';
import {
    forgeOperatorIntentProjectionJson,
    hashRootUserForgeIntentBinding,
} from '../../../src/tools/pennyone/intel/forge_authorization_policy.js';
import {
    cleanupForgeReceiptFixtures,
    createForgeReceiptFixture,
    insertForgeReceiptBead,
} from './forge_receipt_test_support.js';
import {
    appendUserMessage,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';

afterEach(cleanupForgeReceiptFixtures);

function repairArgs(root: string, beadId: string, decisionId: string, threadId: string, overrides = {}) {
    const target = `${root}/target.ts`;
    return {
        bead_id: beadId,
        decision_id: decisionId,
        source_callback_thread_id: threadId,
        objective: 'Repair one bounded CStar source seam.',
        prompt: null,
        target_paths: [target],
        required_output_paths: [target],
        system_under_test: null,
        scope: 'One immutable CStar repair request only.',
        authority_lane: 'yellow' as const,
        required_metrics: [{ name: 'focused', threshold: '= pass' }],
        artifact_expectations: ['source receipt'],
        prohibited_actions: [
            'git_push', 'git_commit', 'git_merge', 'install', 'deploy', 'restart', 'activation',
            'secret_config_mutation', 'credential_mutation', 'token_mutation', 'direct_state_write',
            'destructive_cleanup', 'production_claim', 'expanded_spend', 'authorized_source_collection',
        ],
        requested_actions: ['project_files'],
        spend_policy: { mode: 'live_authorized' as const, max_retries: 0, live_source_allowed: false },
        live_source_policy: 'No live source collection.',
        fixture_policy: 'synthetic_only' as const,
        retry_policy: { budget: 0, spent: 0 },
        callback_contract: { expected_packet: 'SOURCE_RECEIPT', callback_required: true },
        package_locks: [],
        ...overrides,
    };
}

async function setupRepair() {
    const fixture = createForgeReceiptFixture();
    const beadId = `bead:test:root-repair:${randomUUID()}`;
    const decisionId = `decision:test:root-repair:${randomUUID()}`;
    insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
    const session = createSession({ textParts: ['Repair one bounded CStar source seam.'] });
    const originalIdentity = await verifyCodexRequestIdentity(
        validRequestContext(session.threadId, session.turnId),
    );
    const canonical = canonicalizeForgeRequest(
        repairArgs(fixture.root, beadId, decisionId, session.threadId),
        fixture.root,
        decisionId,
        null,
        'project_files',
        1,
    );
    const requestSha256 = hashCanonicalForgeRequest(canonical);
    const input: SaveForgeRequestInput = {
        request_id: buildForgeRequestId(requestSha256),
        repo_id: fixture.repoId,
        bead_id: beadId,
        decision_id: decisionId,
        request_sha256: requestSha256,
        request_summary_json: stableJson(canonical),
        target_paths_sha256: hashForgeTargetPaths(canonical),
        live_source_allowed: false,
        max_attempts: 1,
        requester_thread_id: originalIdentity.thread_id,
        requester_turn_id: originalIdentity.turn_id,
        requester_record_set_sha256: originalIdentity.turn_record_set_sha256,
        authorization_profile: 'root_user_forge_intent_v1',
        adapter_ref: canonical.adapter_ref ?? undefined,
        write_capability: 'project_files',
    };
    const saved = saveForgeRequest(fixture.db, input).request;
    return { fixture, session, input, saved, originalIdentity };
}

function continuationAuthorization(
    request: ReturnType<typeof setupRepair> extends Promise<infer T> ? T['saved'] : never,
    intent: Awaited<ReturnType<typeof buildForgeRootRepairContinuationIntent>>,
    db: import('better-sqlite3').Database,
): AuthorizeForgeRequestInput {
    assert.ok(intent);
    const projection = resolveForgeOperatorWorkItem(db, request, intent);
    const operatorRecordSet = intent.session_record_set_sha256;
    return {
        request_id: request.request_id,
        request_sha256: request.request_sha256,
        authorization_profile: 'root_user_forge_intent_v1',
        authorization_binding_sha256: hashRootUserForgeIntentBinding({
            request,
            projection,
            operator_thread_id: intent.thread_id,
            operator_turn_id: intent.turn_id,
            operator_message_sha256: intent.message_sha256,
            operator_record_sha256: intent.session_record_sha256,
            operator_record_set_sha256: operatorRecordSet,
            operator_record_count: intent.session_record_count,
        }),
        operator_intent_json: forgeOperatorIntentProjectionJson(projection),
        operator_authorization_ref: intent.operator_authorization_ref,
        operator_thread_id: intent.thread_id,
        operator_turn_id: intent.turn_id,
        operator_message_sha256: intent.message_sha256,
        operator_record_sha256: intent.session_record_sha256,
        operator_record_set_sha256: operatorRecordSet,
        operator_record_count: intent.session_record_count,
        authorized_at: intent.authorized_at,
        expires_at: intent.expires_at,
        now: Date.now(),
    };
}

async function assertContinuationSignalError(text: string, errorCode: string): Promise<void> {
    const value = await setupRepair();
    try {
        const continuationTurn = randomUUID();
        appendUserMessage(
            value.session.sessionFile,
            continuationTurn,
            text,
            new Date(Date.parse(value.session.timestamp) + 1_000).toISOString(),
        );
        const identity = await verifyCodexRequestIdentity(
            validRequestContext(value.session.threadId, continuationTurn),
        );
        assert.throws(
            () => buildForgeRootRepairContinuationIntent({
                db: value.fixture.db,
                request: value.saved,
                identity,
            }),
            new RegExp(errorCode),
        );
    } finally {
        value.fixture.db.close();
    }
}

describe('durable root repair request-bound authorization', () => {
    it('persists a request-bound envelope across an interruption without repeating original wording', async () => {
        const value = await setupRepair();
        const binding = getForgeRootRepairBinding(value.fixture.db, value.saved.request_id);
        assert.ok(binding);
        assert.equal(binding.request_sha256, value.saved.request_sha256);
        assert.equal(binding.adapter_ref, null);
        assert.equal(
            value.fixture.db.prepare(
                'SELECT adapter_ref FROM hall_forge_request_root_repair_bindings WHERE request_id = ?',
            ).pluck().get(value.saved.request_id),
            null,
        );
        assert.equal(
            value.fixture.db.prepare(
                'SELECT COUNT(*) FROM hall_forge_authorizations WHERE request_id = ?',
            ).pluck().get(value.saved.request_id),
            0,
        );
        assert.equal(
            value.fixture.db.prepare(
                'SELECT COUNT(*) FROM hall_forge_attempts WHERE request_id = ?',
            ).pluck().get(value.saved.request_id),
            0,
        );
        assert.equal(binding.root_thread_id, value.originalIdentity.thread_id);
        assert.equal(binding.root_turn_id, value.originalIdentity.turn_id);

        const continuationTurn = randomUUID();
        appendUserMessage(
            value.session.sessionFile,
            continuationTurn,
            'Continue the unchanged repair.',
            new Date(Date.parse(value.session.timestamp) + 1_000).toISOString(),
        );
        const identity = await verifyCodexRequestIdentity(
            validRequestContext(value.session.threadId, continuationTurn),
        );
        const intent = buildForgeRootRepairContinuationIntent({
            db: value.fixture.db,
            request: value.saved,
            identity,
        });
        assert.ok(intent);
        assert.equal(intent.work_reference_text, value.saved.bead_id);
        assert.equal(intent.normalized_text, 'durable root repair continuation');
        assert.equal(intent.binding_mode, 'exact_request_receipt');

        const authorization = authorizeForgeRequest(
            value.fixture.db,
            continuationAuthorization(value.saved, intent, value.fixture.db),
        );
        assert.equal(authorization.replayed, false);
        assert.equal(authorization.request.status, 'AUTHORIZED');
        const replay = authorizeForgeRequest(
            value.fixture.db,
            continuationAuthorization(value.saved, intent, value.fixture.db),
        );
        assert.equal(replay.replayed, true);
        assert.equal(
            value.fixture.db.prepare('SELECT COUNT(*) AS count FROM hall_forge_authorizations WHERE request_id = ?')
                .pluck().get(value.saved.request_id),
            1,
        );
        assert.throws(
            () => authorizeForgeRequest(value.fixture.db, {
                ...continuationAuthorization(value.saved, intent, value.fixture.db),
                operator_authorization_ref: 'ordinary-authorizer-conflict',
            }),
            /forge_request_authorization_conflict/,
        );
        value.fixture.db.close();
    });

    it('accepts each exact imperative unchanged-repair continuation form', async () => {
        for (const text of [
            'Continue the unchanged repair',
            'Continue with the unchanged repair.',
            'Resume the unchanged repair!',
            'Resume with the unchanged repair',
            'Proceed with the unchanged repair.',
        ]) {
            const value = await setupRepair();
            try {
                const continuationTurn = randomUUID();
                appendUserMessage(
                    value.session.sessionFile,
                    continuationTurn,
                    text,
                    new Date(Date.parse(value.session.timestamp) + 1_000).toISOString(),
                );
                const identity = await verifyCodexRequestIdentity(
                    validRequestContext(value.session.threadId, continuationTurn),
                );
                const intent = buildForgeRootRepairContinuationIntent({
                    db: value.fixture.db,
                    request: value.saved,
                    identity,
                });
                assert.ok(intent);
                assert.equal(intent.binding_mode, 'exact_request_receipt');
            } finally {
                value.fixture.db.close();
            }
        }
    });

    it('rejects revocation, questions, and a different root thread', async () => {
        const revoked = await setupRepair();
        const revokedTurn = randomUUID();
        appendUserMessage(
            revoked.session.sessionFile,
            revokedTurn,
            'Stop the Forge repair.',
            new Date(Date.parse(revoked.session.timestamp) + 1_000).toISOString(),
        );
        const revokedIdentity = await verifyCodexRequestIdentity(
            validRequestContext(revoked.session.threadId, revokedTurn),
        );
        assert.throws(
            () => buildForgeRootRepairContinuationIntent({
                db: revoked.fixture.db,
                request: revoked.saved,
                identity: revokedIdentity,
            }),
            /forge_root_repair_continuation_revoked/,
        );
        revoked.fixture.db.close();

        const questioned = await setupRepair();
        const questionTurn = randomUUID();
        appendUserMessage(
            questioned.session.sessionFile,
            questionTurn,
            'Is it okay to continue?',
            new Date(Date.parse(questioned.session.timestamp) + 1_000).toISOString(),
        );
        const identity = await verifyCodexRequestIdentity(
            validRequestContext(questioned.session.threadId, questionTurn),
        );
        assert.throws(
            () => buildForgeRootRepairContinuationIntent({
                db: questioned.fixture.db,
                request: questioned.saved,
                identity,
            }),
            /forge_root_repair_continuation_question/,
        );
        assert.throws(
            () => buildForgeRootRepairContinuationIntent({
                db: questioned.fixture.db,
                request: questioned.saved,
                identity: { ...identity, thread_id: randomUUID() },
            }),
            /forge_root_repair_continuation_thread_mismatch/,
        );
        questioned.fixture.db.close();
    });

    it('rejects host aliases, unrelated text, protected expansion, and non-affirmative signals', async () => {
        for (const [text, errorCode] of [
            ['The host resumed the unchanged repair.', 'forge_root_repair_continuation_signal_invalid'],
            ['Continue the repair.', 'forge_root_repair_continuation_signal_invalid'],
            ['Inspect the README.', 'forge_root_repair_continuation_signal_invalid'],
            ['Continue and deploy it!', 'forge_root_repair_continuation_protected_action'],
            ['Continue with scope expansion.', 'forge_root_repair_continuation_protected_action'],
            ['Continue with a new target.', 'forge_root_repair_continuation_signal_invalid'],
            ['Continue with a different target.', 'forge_root_repair_continuation_signal_invalid'],
            ['Continue with a new scope.', 'forge_root_repair_continuation_signal_invalid'],
            ['Continue with the unchanged repair?', 'forge_root_repair_continuation_question'],
            ['Do not continue with the unchanged repair.', 'forge_root_repair_continuation_revoked'],
            ['Fork the repair.', 'forge_root_repair_continuation_revoked'],
            ['Switch to the other repair.', 'forge_root_repair_continuation_revoked'],
        ] as const) {
            await assertContinuationSignalError(text, errorCode);
        }
    });

    it('fails closed on request, scope, package-lock, and existing-attempt drift', async () => {
        const value = await setupRepair();
        const continuationTurn = randomUUID();
        appendUserMessage(
            value.session.sessionFile,
            continuationTurn,
            'Continue the unchanged repair.',
            new Date(Date.parse(value.session.timestamp) + 1_000).toISOString(),
        );
        const identity = await verifyCodexRequestIdentity(
            validRequestContext(value.session.threadId, continuationTurn),
        );
        const input = {
            request_id: value.saved.request_id,
            request_sha256: value.saved.request_sha256,
            authorization_profile: 'root_user_forge_intent_v1' as const,
            operator_authorization_ref: 'cstar-forge-root-repair-continuation:test',
            operator_thread_id: identity.thread_id,
            operator_turn_id: identity.turn_id,
            operator_message_sha256: identity.turn_record_sha256,
            operator_record_sha256: identity.turn_record_sha256,
            operator_record_set_sha256: identity.turn_record_set_sha256,
            operator_record_count: identity.turn_record_count,
            authorized_at: Date.now(),
            expires_at: Date.now() + 60_000,
        } as AuthorizeForgeRequestInput;
        assert.throws(
            () => assertForgeRootRepairContinuationAuthorization({
                db: value.fixture.db,
                request: { ...value.saved, request_summary_json: value.saved.request_summary_json.replace('source seam', 'other scope') },
                input,
            }),
            /forge_root_repair_continuation_drift/,
        );
        assert.throws(
            () => assertForgeRootRepairContinuationAuthorization({
                db: value.fixture.db,
                request: { ...value.saved, target_paths_sha256: '0'.repeat(64) },
                input,
            }),
            /forge_root_repair_continuation_drift/,
        );
        assert.throws(
            () => assertForgeRootRepairContinuationAuthorization({
                db: value.fixture.db,
                request: value.saved,
                input: { ...input, request_sha256: '0'.repeat(64) },
            }),
            /forge_root_repair_continuation_lineage_invalid/,
        );
        const changedPackageLockSummary = stableJson({
            ...(JSON.parse(value.saved.request_summary_json) as Record<string, unknown>),
            package_locks: [{ path: 'package-lock.json', sha256: 'f'.repeat(64) }],
        });
        const changedPackageLockRequestHash = createHash('sha256')
            .update(changedPackageLockSummary, 'utf8')
            .digest('hex');
        assert.throws(
            () => assertForgeRootRepairContinuationAuthorization({
                db: value.fixture.db,
                request: {
                    ...value.saved,
                    request_sha256: changedPackageLockRequestHash,
                    request_summary_json: changedPackageLockSummary,
                },
                input: { ...input, request_sha256: changedPackageLockRequestHash },
            }),
            /forge_root_repair_continuation_drift/,
        );
        value.fixture.db.prepare(`
            INSERT INTO hall_forge_attempts (
                attempt_id, request_id, ordinal, idempotency_key, execution_receipt_id,
                adapter_ref, status, reserved_at, updated_at
            ) VALUES (?, ?, 1, ?, ?, ?, 'RESERVED', ?, ?)
        `).run(
            'attempt:root-repair', value.saved.request_id, 'key:root-repair',
            'receipt:root-repair', value.saved.adapter_ref ?? '', Date.now(), Date.now(),
        );
        assert.throws(
            () => assertForgeRootRepairContinuationAuthorization({
                db: value.fixture.db,
                request: value.saved,
                input,
            }),
            /forge_root_repair_continuation_requires_unspent_request/,
        );
        value.fixture.db.close();
    });

    it('does not capture protected requests or rewrite legacy v2', () => {
        const fixture = createForgeReceiptFixture();
        const beadId = `bead:test:protected:${randomUUID()}`;
        insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
        ensureForgeRootRepairBindingSchema(fixture.db);
        for (const requestedAction of [
            'restart', 'deploy', 'activation', 'git_push', 'secret_config_mutation', 'expanded_spend',
        ]) {
            assert.throws(
                () => canonicalizeForgeRequest(
                    repairArgs(fixture.root, beadId, 'decision:protected', randomUUID(), {
                        requested_actions: [requestedAction],
                    }),
                    fixture.root,
                    'decision:protected',
                    'cstar-forge-hermes-minimax-worker-adapter',
                    'project_files',
                    1,
                ),
                /dispatch_requested_action_red_gated/,
            );
        }
        const v2 = {
            request_id: `dispatch-forge-${'a'.repeat(32)}`,
            repo_id: fixture.repoId,
            bead_id: beadId,
            decision_id: 'decision:v2',
            request_sha256: 'b'.repeat(64),
            request_summary_json: '{"schema":"cstar.forge_request.v2","immutable":true}',
            target_paths_sha256: 'c'.repeat(64),
            live_source_allowed: false,
            max_attempts: 1,
            requester_thread_id: randomUUID(),
            requester_turn_id: randomUUID(),
            requester_record_set_sha256: 'd'.repeat(64),
            authorization_profile: 'exact_request_challenge_v1' as const,
            authorization_challenge_sha256: 'e'.repeat(64),
            adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
            write_capability: 'project_files' as const,
        } satisfies SaveForgeRequestInput;
        const saved = saveForgeRequest(fixture.db, v2).request;
        assert.equal(getForgeRootRepairBinding(fixture.db, saved.request_id), null);
        assert.equal(saved.request_summary_json, v2.request_summary_json);
        fixture.db.close();
    });
});
