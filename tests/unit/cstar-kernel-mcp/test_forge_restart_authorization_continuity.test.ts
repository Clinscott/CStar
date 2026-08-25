import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { closeDb, database } from '../../../src/tools/pennyone/intel/database.js';
import { getForgeAuthorizationByRequest, getForgeRequest } from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { saveForgeRequest } from '../../../src/tools/pennyone/intel/forge_request_authorization_controller.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import { handleForgeAuthorize } from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
import { hashForgeAuthorizationChallenge } from '../../../src/tools/cstar-kernel-mcp/tools/forge_authorization_challenge.js';
import {
    buildForgeRequestId,
    canonicalizeForgeRequest,
    hashCanonicalForgeRequest,
    hashForgeTargetPaths,
    stableJson,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_request_contract.js';
import {
    appendUserMessage,
    cleanupOperatorAuthorizationFixtures,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';
import { writeCountingAdapter } from './forge_durable_execution_test_support.js';
import { verifyCodexRequestIdentity } from '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import { verifyForgeContinuationLineage } from '../../../src/tools/cstar-kernel-mcp/tools/forge_continuation_authority.js';

const originalRoot = registry.getRoot();
const originalAdapter = process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT;
const originalRuntimeBypass = process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
const roots: string[] = [];
const BEAD_ID = 'bead:repair:tokenpath-causal-evaluation-promotion-2026-07-13';
const DECISION_ID = 'decision:tokenpath-q0-runtime-tests-phase1-recovery1-2026-07-15';
const TARGET_REF = 'TokenPath Q0 phase-one repair';

function parse(result: { content: Array<{ text: string }> }): Record<string, any> {
    return JSON.parse(result.content[0]!.text) as Record<string, any>;
}

function setupRoot(label: string) {
    const root = fs.mkdtempSync(path.join('/tmp', `cstar-forge-current-${label}-`));
    fs.chmodSync(root, 0o700);
    roots.push(root);
    registry.setRoot(root);
    closeDb();
    const target = path.join(root, 'target.txt');
    fs.writeFileSync(target, 'synthetic target\n', { mode: 0o600 });
    process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = writeCountingAdapter(root, true);
    const db = database.getWritableDb(root);
    const now = Date.now();
    db.prepare(`
        INSERT INTO hall_beads (
            bead_id, repo_id, target_kind, target_ref, target_path, rationale,
            status, created_at, updated_at
        ) VALUES (?, ?, 'WORKFLOW', ?, ?, 'Current-turn authorization test',
                  'IN_PROGRESS', ?, ?)
    `).run(
        BEAD_ID,
        buildHallRepositoryId(normalizeHallPath(root)),
        TARGET_REF,
        target,
        now,
        now,
    );
    return { root, target, db };
}

function requestArgs(value: ReturnType<typeof setupRoot>, sourceThreadId: string) {
    return {
        bead_id: BEAD_ID,
        decision_id: DECISION_ID,
        source_callback_thread_id: sourceThreadId,
        objective: 'Build the bounded TokenPath Q0 phase-one repair.',
        prompt: 'Return only the bounded synthetic result.',
        target_paths: [value.target],
        scope: 'Current-turn authorization test only.',
        authority_lane: 'yellow' as const,
        required_metrics: [{ name: 'current_turn_authority', threshold: '= pass' }],
        artifact_expectations: ['current-turn authorization receipt'],
        prohibited_actions: ['project_files', 'authorized_source_collection'],
        requested_actions: ['response_only'],
        spend_policy: { mode: 'live_authorized' as const, max_retries: 0, live_source_allowed: false },
        live_source_policy: 'no live source collection',
        fixture_policy: 'synthetic_only' as const,
        retry_policy: { budget: 0, spent: 0 },
        callback_contract: { expected_packet: 'CURRENT_TURN_AUTH_TEST', callback_required: true },
        package_locks: [],
        execution_adapter_ref: 'cstar-forge-hermes-minimax-adapter',
    };
}

function saveExactRequest(value: ReturnType<typeof setupRoot>, sourceThreadId: string) {
    const canonical = canonicalizeForgeRequest(
        requestArgs(value, sourceThreadId),
        value.root,
        DECISION_ID,
        'cstar-forge-hermes-minimax-adapter',
        'response_only',
        1,
    );
    const requestSha256 = hashCanonicalForgeRequest(canonical);
    const requestId = buildForgeRequestId(requestSha256);
    saveForgeRequest(value.db, {
        request_id: requestId,
        repo_id: buildHallRepositoryId(normalizeHallPath(value.root)),
        bead_id: BEAD_ID,
        decision_id: DECISION_ID,
        request_sha256: requestSha256,
        request_summary_json: stableJson(canonical),
        target_paths_sha256: hashForgeTargetPaths(canonical),
        live_source_allowed: false,
        max_attempts: 1,
        requester_thread_id: randomUUID(),
        requester_turn_id: randomUUID(),
        requester_record_set_sha256: 'a'.repeat(64),
        authorization_profile: 'exact_request_challenge_v1',
        authorization_challenge_sha256: hashForgeAuthorizationChallenge(
            requestId,
            requestSha256,
        ),
        adapter_ref: 'cstar-forge-hermes-minimax-adapter',
        write_capability: 'response_only',
    });
    return { requestId, requestSha256 };
}

function appendExactEventMirror(sessionFile: string, message: string, timestamp: string): void {
    fs.appendFileSync(sessionFile, `${JSON.stringify({
        timestamp,
        type: 'event_msg',
        payload: {
            type: 'user_message',
            message,
            images: [],
            local_images: [],
            text_elements: [],
        },
    })}\n`);
}

beforeEach(() => {
    process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = '1';
});

afterEach(() => {
    closeDb();
    registry.setRoot(originalRoot);
    cleanupOperatorAuthorizationFixtures();
    if (originalAdapter === undefined) delete process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT;
    else process.env.CSTAR_FORGE_HERMES_MINIMAX_ADAPTER_SCRIPT = originalAdapter;
    if (originalRuntimeBypass === undefined) delete process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS;
    else process.env.CSTAR_FORGE_RUNTIME_TEST_BYPASS = originalRuntimeBypass;
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('Forge current-turn authorization after host restart', () => {
    it('authorizes a fresh ordinary continue-building instruction', async () => {
        const value = setupRoot('fresh-resume');
        const text = 'Continue building the TokenPath Q0 phase-one repair.';
        const session = createSession({ textParts: [text] });
        const request = saveExactRequest(value, session.threadId);
        const granted = parse(await handleForgeAuthorize({
            forge_request_receipt_id: request.requestId,
            request_sha256: request.requestSha256,
        }, validRequestContext(session.threadId, session.turnId)));

        assert.equal(granted.status, 'authorized');
        assert.equal(granted.authorization_profile, 'root_user_forge_intent_v1');
        assert.equal(getForgeAuthorizationByRequest(value.db, request.requestId)?.operator_turn_id,
            session.turnId);
    });

    it('accepts an exact adjacent host event mirror without widening authority', async () => {
        const value = setupRoot('exact-mirror');
        const text = 'Resume the TokenPath Q0 phase-one repair.';
        const session = createSession({ textParts: [text] });
        appendExactEventMirror(
            session.sessionFile,
            text,
            new Date(Date.parse(session.timestamp) + 1).toISOString(),
        );
        const request = saveExactRequest(value, session.threadId);
        const granted = parse(await handleForgeAuthorize({
            forge_request_receipt_id: request.requestId,
            request_sha256: request.requestSha256,
        }, validRequestContext(session.threadId, session.turnId)));

        assert.equal(granted.status, 'authorized');
    });

    for (const [label, text] of [
        ['restart acknowledgement', 'Restarted'],
        ['status question', 'Status?'],
        ['accidental restart note', 'child restarted pc nothing you did'],
        ['bare continue', 'Continue.'],
        ['bare proceed', 'Proceed.'],
    ] as const) {
        it(`rejects ${label} as Forge authority`, async () => {
            const value = setupRoot(label.replaceAll(' ', '-'));
            const session = createSession({ textParts: [text] });
            const request = saveExactRequest(value, session.threadId);
            const rejected = parse(await handleForgeAuthorize({
                forge_request_receipt_id: request.requestId,
                request_sha256: request.requestSha256,
            }, validRequestContext(session.threadId, session.turnId)));

            assert.equal(rejected.error_code, 'forge_operator_authorization_required');
            assert.equal(getForgeAuthorizationByRequest(value.db, request.requestId), null);
        });
    }

    it('does not replay an earlier build instruction through a restart acknowledgement', async () => {
        const value = setupRoot('no-cross-turn-replay');
        const session = createSession({
            textParts: ['Build the TokenPath Q0 phase-one repair.'],
            timestamp: new Date(Date.now() - 1_000).toISOString(),
        });
        const currentTurnId = randomUUID();
        appendUserMessage(session.sessionFile, currentTurnId, 'Restarted', new Date().toISOString());
        const request = saveExactRequest(value, session.threadId);
        const rejected = parse(await handleForgeAuthorize({
            forge_request_receipt_id: request.requestId,
            request_sha256: request.requestSha256,
        }, validRequestContext(session.threadId, currentTurnId)));

        assert.equal(rejected.error_code, 'forge_operator_authorization_required');
        assert.equal(getForgeAuthorizationByRequest(value.db, request.requestId), null);
    });

    it('returns a human action for a reserved goal-only host turn', async () => {
        const value = setupRoot('goal-only');
        const session = createSession({ textParts: [[
            '<codex_internal_context source="goal">',
            'Continue working toward the active thread goal.',
            '</codex_internal_context>',
        ].join('\n')] });
        const request = saveExactRequest(value, session.threadId);
        const rejected = parse(await handleForgeAuthorize({
            forge_request_receipt_id: request.requestId,
            request_sha256: request.requestSha256,
        }, validRequestContext(session.threadId, session.turnId)));

        assert.equal(rejected.error_code, 'forge_operator_signal_required');
        assert.equal(rejected.status, 'operator_signal_required');
        assert.match(rejected.next_action, /fresh ordinary instruction/i);
        assert.equal(rejected.forge_execution.live_spend, false);
        assert.equal(getForgeAuthorizationByRequest(value.db, request.requestId), null);
    });

    it('permits only same-thread unrevoked continuation before reconciliation', async () => {
        const value = setupRoot('continuation-lineage');
        const session = createSession({ textParts: ['Build the TokenPath Q0 phase-one repair.'] });
        const requestRef = saveExactRequest(value, session.threadId);
        const granted = parse(await handleForgeAuthorize({
            forge_request_receipt_id: requestRef.requestId,
            request_sha256: requestRef.requestSha256,
        }, validRequestContext(session.threadId, session.turnId)));
        assert.equal(granted.status, 'authorized');
        const authorization = getForgeAuthorizationByRequest(value.db, requestRef.requestId)!;
        assert.ok(getForgeRequest(value.db, requestRef.requestId));
        const currentTurn = randomUUID();
        appendUserMessage(
            session.sessionFile,
            currentTurn,
            'The error should be fixed and the build proceed.',
            new Date(Date.now() + 1).toISOString(),
        );
        const caller = await verifyCodexRequestIdentity(
            validRequestContext(session.threadId, currentTurn),
        );
        assert.doesNotThrow(() => verifyForgeContinuationLineage({ authorization, caller }));
        assert.throws(() => verifyForgeContinuationLineage({
            authorization, caller, now: authorization.expires_at + 1,
        }), /forge_continuation_caller_invalid/);

        const other = createSession({ textParts: ['Continue unrelated work.'] });
        const otherCaller = await verifyCodexRequestIdentity(
            validRequestContext(other.threadId, other.turnId),
        );
        assert.throws(() => verifyForgeContinuationLineage({
            authorization, caller: otherCaller,
        }), /forge_continuation_caller_invalid/);
    });

    it('detects a later explicit Forge revocation', async () => {
        const value = setupRoot('continuation-revocation');
        const session = createSession({ textParts: ['Build the TokenPath Q0 phase-one repair.'] });
        const requestRef = saveExactRequest(value, session.threadId);
        const granted = parse(await handleForgeAuthorize({
            forge_request_receipt_id: requestRef.requestId,
            request_sha256: requestRef.requestSha256,
        }, validRequestContext(session.threadId, session.turnId)));
        assert.equal(granted.status, 'authorized');
        const revokedTurn = randomUUID();
        appendUserMessage(
            session.sessionFile,
            revokedTurn,
            'Stop the Forge build request.',
            new Date(Date.now() + 1).toISOString(),
        );
        const caller = await verifyCodexRequestIdentity(
            validRequestContext(session.threadId, revokedTurn),
        );
        assert.throws(() => verifyForgeContinuationLineage({
            authorization: getForgeAuthorizationByRequest(value.db, requestRef.requestId)!,
            caller,
        }), /forge_continuation_revoked/);
    });

    for (const [label, revocation] of [
        ['stop', 'Stop the Forge build request.'],
        ['proceed', 'Do not proceed with the Forge build.'],
        ['execute', "Don't execute the build."],
        ['rescind', 'I rescind the Forge authorization.'],
    ] as const) {
        it(`detects an appended ${label} revocation in the authorizing turn`, async () => {
            const value = setupRoot(`same-turn-revocation-${label}`);
            const session = createSession({ textParts: ['Build the TokenPath Q0 phase-one repair.'] });
            const requestRef = saveExactRequest(value, session.threadId);
            const granted = parse(await handleForgeAuthorize({
                forge_request_receipt_id: requestRef.requestId,
                request_sha256: requestRef.requestSha256,
            }, validRequestContext(session.threadId, session.turnId)));
            assert.equal(granted.status, 'authorized');
            appendUserMessage(
                session.sessionFile, session.turnId, revocation,
                new Date(Date.now() + 1).toISOString(),
            );
            const caller = await verifyCodexRequestIdentity(
                validRequestContext(session.threadId, session.turnId),
            );
            assert.throws(() => verifyForgeContinuationLineage({
                authorization: getForgeAuthorizationByRequest(value.db, requestRef.requestId)!, caller,
            }), /forge_continuation_revoked/);
        });
    }
});
