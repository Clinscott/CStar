import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { normalizeMcpResponse } from '../../../src/tools/cstar-kernel-mcp/contracts/responses.js';
import {
    getForgeAuthorizationByRequest,
    getForgeRequest,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { handleForgeAuthorize } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_authorize.js';
import { handleForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
import { handleForgeExecute } from '../../../src/tools/cstar-kernel-mcp/tools/forge_execute.js';
import { verifyForgeExecutionAuthorization } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_execution_authority.js';
import { verifyCodexRequestIdentity } from
    '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import {
    appendUserMessage,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';
import {
    beginNaturalAuthorizationTest,
    cleanupNaturalAuthorizationTest,
    insertBead,
    parse,
    requestArgs,
    setupRoot,
} from './forge_natural_authorization_test_support.js';

const PARENT = 'bead:cstar:set-autonomous-parent-test';
const CHILD = 'bead:cstar:set-autonomous-child-test';
const MISSION = 'decision:cstar:set-autonomous-test';
const DECISION = `${MISSION}:batch-1`;
const DESIGN = 'd'.repeat(64);

function mutationIdentity(identity: Awaited<ReturnType<typeof verifyCodexRequestIdentity>>) {
    return {
        source: 'codex_request_meta', thread_id: identity.thread_id, turn_id: identity.turn_id,
        turn_record_set_sha256: identity.turn_record_set_sha256,
    };
}

function metadata(identity: Awaited<ReturnType<typeof verifyCodexRequestIdentity>>) {
    return {
        source: 'cstar-kernel-mcp', schema: 'cstar.set_manifest.v1', decision_id: MISSION,
        design_revision: 1, design_sha256: DESIGN, batch_order: [CHILD], operator_set: true,
        mutation_request_identity: mutationIdentity(identity),
    };
}

function childMetadata(identity: Awaited<ReturnType<typeof verifyCodexRequestIdentity>>) {
    return {
        source: 'cstar-kernel-mcp', parent_bead_id: PARENT, order: 1, depends_on: [],
        design_sha256: DESIGN, owning_lane: 'Forge', mutation_request_identity: mutationIdentity(identity),
    };
}

function writeMetadata(value: ReturnType<typeof setupRoot>, beadId: string, valueToWrite: object): void {
    value.db.prepare('UPDATE hall_beads SET metadata_json = ? WHERE bead_id = ?')
        .run(JSON.stringify(valueToWrite), beadId);
}

async function prepare(label: string, authorize = true) {
    const value = setupRoot(label);
    const session = createSession({
        textParts: ['SET'], timestamp: new Date(Date.now() - 10_000).toISOString(),
    });
    const originalContext = validRequestContext(session.threadId, session.turnId);
    const identity = await verifyCodexRequestIdentity(originalContext);
    insertBead(value, PARENT, MISSION);
    insertBead(value, CHILD, DECISION);
    writeMetadata(value, PARENT, metadata(identity));
    writeMetadata(value, CHILD, childMetadata(identity));
    const pending = parse(await handleForgeRequest(
        requestArgs(value, CHILD, DECISION, session.threadId), originalContext,
    ));
    if (authorize) {
        const authorized = parse(await handleForgeAuthorize({
            forge_request_receipt_id: pending.receipt_id, request_sha256: pending.request_sha256,
        }, originalContext));
        assert.equal(authorized.status, 'authorized', JSON.stringify(authorized));
    }
    return { value, session, originalContext, pending };
}

function structuralTurn(fixture: Awaited<ReturnType<typeof prepare>>): ReturnType<typeof validRequestContext> {
    return validRequestContext(fixture.session.threadId, randomUUID());
}

function appendSameTurn(
    fixture: Awaited<ReturnType<typeof prepare>>,
    text: string,
    offsetSeconds: number,
): void {
    appendUserMessage(
        fixture.session.sessionFile, fixture.session.turnId, text,
        new Date(Date.parse(fixture.session.timestamp) + offsetSeconds * 1_000).toISOString(),
    );
}

async function authorizeStructurally(
    fixture: Awaited<ReturnType<typeof prepare>>,
): Promise<Record<string, any>> {
    return parse(await handleForgeAuthorize({
        forge_request_receipt_id: fixture.pending.receipt_id,
        request_sha256: fixture.pending.request_sha256,
    }, structuralTurn(fixture)));
}

function appendRevocation(fixture: Awaited<ReturnType<typeof prepare>>): ReturnType<typeof validRequestContext> {
    const turnId = randomUUID();
    appendUserMessage(
        fixture.session.sessionFile, turnId, 'Stop the Forge work.',
        new Date(Date.parse(fixture.session.timestamp) + 1_000).toISOString(),
    );
    return validRequestContext(fixture.session.threadId, randomUUID());
}

beforeEach(beginNaturalAuthorizationTest);
afterEach(cleanupNaturalAuthorizationTest);

describe('same-root autonomous SET Forge dispatch', () => {
    it('preserves the immutable SET snapshot across same-turn informational growth', async () => {
        const fixture = await prepare('pending-same-turn-growth', false);
        appendSameTurn(
            fixture,
            'The scoped kernel reload completed; this record grants no additional authority.',
            1,
        );
        appendSameTurn(fixture, 'The pending request remains unchanged.', 2);
        const authorized = await authorizeStructurally(fixture);
        assert.equal(authorized.status, 'authorized', JSON.stringify(authorized));
        const stored = getForgeAuthorizationByRequest(
            fixture.value.db, fixture.pending.receipt_id,
        )!;
        assert.equal(stored.operator_record_count, 1);
        assert.equal(stored.operator_record_set_sha256,
            getForgeRequest(fixture.value.db, fixture.pending.receipt_id)!
                .requester_record_set_sha256);
    });

    it('rejects duplicate and non-operative SET-shaped same-turn growth', async () => {
        for (const [label, text] of [
            ['duplicate', 'SET'],
            ['suffix', 'SET now'],
            ['identifier-suffix-dot', 'SET.extra'],
            ['identifier-suffix-slash', 'SET/extra'],
            ['question', 'SET?'],
            ['modal', 'Maybe SET'],
            ['quoted', 'The report says "SET".'],
        ] as const) {
            const fixture = await prepare(`growth-${label}`, false);
            appendSameTurn(fixture, text, 1);
            const rejected = await authorizeStructurally(fixture);
            assert.equal(
                rejected.error_code,
                'forge_set_manifest_operator_signal_ambiguous',
                `${label}: ${JSON.stringify(rejected)}`,
            );
            assert.equal(getForgeAuthorizationByRequest(
                fixture.value.db, fixture.pending.receipt_id,
            ), null);
        }
    });

    it('rejects same-turn revocation before or after informational growth', async () => {
        for (const [label, records] of [
            ['terse-before', ['Cancel it.', 'The reload completed.']],
            ['explicit-after', ['The reload completed.', 'Do not proceed.']],
            ['withdraw-before', ['Withdraw this.', 'The reload completed.']],
            ['never-mind-after', ['The reload completed.', 'Never mind.']],
        ] as const) {
            const fixture = await prepare(`growth-revoked-${label}`, false);
            records.forEach((text, index) => appendSameTurn(fixture, text, index + 1));
            const rejected = await authorizeStructurally(fixture);
            assert.equal(
                rejected.error_code,
                'forge_set_manifest_operator_signal_revoked',
                `${label}: ${JSON.stringify(rejected)}`,
            );
            assert.equal(getForgeAuthorizationByRequest(
                fixture.value.db, fixture.pending.receipt_id,
            ), null);
        }
    });

    it('authorizes a pending Batch 1 request from a later no-record turn', async () => {
        const fixture = await prepare('pending-no-record', false);
        const currentContext = structuralTurn(fixture);
        const authorized = parse(await handleForgeAuthorize({
            forge_request_receipt_id: fixture.pending.receipt_id,
            request_sha256: fixture.pending.request_sha256,
        }, currentContext));
        assert.equal(authorized.status, 'authorized', JSON.stringify(authorized));
        assert.match(authorized.mutation.guardrail.reason, /original SET grant authorized/i);
        assert.match(authorized.next_action, /later same-root structural turn/i);
        assert.match(authorized.next_action, /without a fresh operator instruction/i);
        const auth = getForgeAuthorizationByRequest(
            fixture.value.db, fixture.pending.receipt_id,
        )!;
        assert.equal(auth.operator_turn_id, fixture.session.turnId);
        assert.equal(auth.operator_thread_id, fixture.session.threadId);
        assert.equal(auth.operator_record_count, 1);
        const execution = await verifyForgeExecutionAuthorization(
            fixture.value.db, getForgeRequest(fixture.value.db, fixture.pending.receipt_id)!,
            auth.operator_authorization_ref, structuralTurn(fixture),
        );
        assert.equal(execution.mode, 'autonomous_set_manifest_v1');
        assert.equal(execution.authorization.operator_turn_id, fixture.session.turnId);
    });

    it('keeps the original SET authority for a later structural caller', async () => {
        const fixture = await prepare('accept');
        const originalRequest = getForgeRequest(fixture.value.db, fixture.pending.receipt_id)!;
        const originalAuth = getForgeAuthorizationByRequest(
            fixture.value.db, fixture.pending.receipt_id,
        )!;
        const original = await verifyForgeExecutionAuthorization(
            fixture.value.db, originalRequest, originalAuth.operator_authorization_ref,
            fixture.originalContext,
        );
        assert.equal(original.mode, 'authorizing_turn');

        const currentContext = structuralTurn(fixture);
        const current = await verifyForgeExecutionAuthorization(
            fixture.value.db, getForgeRequest(fixture.value.db, fixture.pending.receipt_id)!,
            originalAuth.operator_authorization_ref, currentContext,
        );
        assert.equal(current.mode, 'autonomous_set_manifest_v1');
        assert.equal(current.authorization.operator_turn_id, originalAuth.operator_turn_id);
        assert.equal(current.authorization.operator_record_set_sha256, originalAuth.operator_record_set_sha256);
    });

    it('replays authorization without asking the later root turn to repeat SET', async () => {
        const fixture = await prepare('replay');
        const currentContext = structuralTurn(fixture);
        const replay = parse(await handleForgeAuthorize({
            forge_request_receipt_id: fixture.pending.receipt_id,
            request_sha256: fixture.pending.request_sha256,
        }, currentContext));
        assert.equal(replay.status, 'authorized', JSON.stringify(replay));
        assert.equal(replay.authorization_replayed, true);
        assert.match(replay.next_action, /original SET grant authorized/i);
        assert.match(replay.next_action, /later same-root structural turn/i);
    });

    it('rejects a cross-thread caller and a later revocation', async () => {
        const crossThread = await prepare('cross-thread');
        const other = createSession({ textParts: ['Continue the approved structural operation.'] });
        const auth = getForgeAuthorizationByRequest(
            crossThread.value.db, crossThread.pending.receipt_id,
        )!;
        await assert.rejects(
            verifyForgeExecutionAuthorization(
                crossThread.value.db,
                getForgeRequest(crossThread.value.db, crossThread.pending.receipt_id)!,
                auth.operator_authorization_ref,
                validRequestContext(other.threadId, other.turnId),
            ),
            /forge_set_manifest_autonomous_caller_thread_mismatch/,
        );

        const revoked = await prepare('revoked');
        const revokedContext = appendRevocation(revoked);
        await assert.rejects(
            verifyForgeExecutionAuthorization(
                revoked.value.db,
                getForgeRequest(revoked.value.db, revoked.pending.receipt_id)!,
                getForgeAuthorizationByRequest(
                    revoked.value.db, revoked.pending.receipt_id,
                )!.operator_authorization_ref,
                revokedContext,
            ),
            /forge_set_manifest_operator_signal_revoked/,
        );
    });

    it('revalidates expiry, request bytes, and the immutable manifest before dispatch', async () => {
        const expired = await prepare('expired');
        expired.value.db.prepare(
            'UPDATE hall_forge_authorizations SET expires_at = 0 WHERE request_id = ?',
        ).run(expired.pending.receipt_id);
        expired.value.db.prepare(
            'UPDATE hall_forge_requests SET expires_at = 0 WHERE request_id = ?',
        ).run(expired.pending.receipt_id);
        const expiredAuth = getForgeAuthorizationByRequest(
            expired.value.db, expired.pending.receipt_id,
        )!;
        await assert.rejects(
            verifyForgeExecutionAuthorization(
                expired.value.db,
                getForgeRequest(expired.value.db, expired.pending.receipt_id)!,
                expiredAuth.operator_authorization_ref,
                structuralTurn(expired),
            ),
            /forge_exact_authorization_expired/,
        );

        const requestDrift = await prepare('request-drift');
        const request = getForgeRequest(requestDrift.value.db, requestDrift.pending.receipt_id)!;
        const summary = JSON.parse(request.request_summary_json) as Record<string, unknown>;
        summary.scope = 'expanded beyond the SET manifest';
        requestDrift.value.db.prepare(
            'UPDATE hall_forge_requests SET request_summary_json = ? WHERE request_id = ?',
        ).run(JSON.stringify(summary), requestDrift.pending.receipt_id);
        const requestAuth = getForgeAuthorizationByRequest(
            requestDrift.value.db, requestDrift.pending.receipt_id,
        )!;
        await assert.rejects(
            verifyForgeExecutionAuthorization(
                requestDrift.value.db,
                getForgeRequest(requestDrift.value.db, requestDrift.pending.receipt_id)!,
                requestAuth.operator_authorization_ref,
                structuralTurn(requestDrift),
            ),
            /forge_set_manifest_request_policy_invalid/,
        );

        const manifestDrift = await prepare('manifest-drift');
        const parent = manifestDrift.value.db.prepare(
            'SELECT metadata_json FROM hall_beads WHERE bead_id = ?',
        ).pluck().get(PARENT) as string;
        const parentJson = JSON.parse(parent) as Record<string, unknown>;
        parentJson.design_revision = 2;
        manifestDrift.value.db.prepare(
            'UPDATE hall_beads SET metadata_json = ? WHERE bead_id = ?',
        ).run(JSON.stringify(parentJson), PARENT);
        const manifestAuth = getForgeAuthorizationByRequest(
            manifestDrift.value.db, manifestDrift.pending.receipt_id,
        )!;
        await assert.rejects(
            verifyForgeExecutionAuthorization(
                manifestDrift.value.db,
                getForgeRequest(manifestDrift.value.db, manifestDrift.pending.receipt_id)!,
                manifestAuth.operator_authorization_ref,
                structuralTurn(manifestDrift),
            ),
            /forge_set_manifest_persisted_reference_drift/,
        );
    });

    it('does not demand a current user record before the execute authority seam', async () => {
        const fixture = await prepare('execute-no-record');
        const auth = getForgeAuthorizationByRequest(
            fixture.value.db, fixture.pending.receipt_id,
        )!;
        const result = await handleForgeExecute({
            ...requestArgs(fixture.value, CHILD, DECISION, fixture.session.threadId),
            forge_request_receipt_id: fixture.pending.receipt_id,
            forge_request_decision_id: DECISION,
            forge_request_bead_id: CHILD,
            execution_mode: 'live_authorized',
            operator_authorization_ref: auth.operator_authorization_ref,
            idempotency_key: 'autonomous-no-record-guard',
        }, structuralTurn(fixture));
        const normalized = normalizeMcpResponse(result);
        const normalizedPayload = parse(normalized);
        assert.equal(normalized.isError, undefined);
        assert.equal(normalizedPayload.outcome, 'ok');
        assert.equal(normalizedPayload.error_code, undefined);
        assert.doesNotMatch(result.content[0].text, /codex_request_identity_turn_match_count:0/);
    });

    it('rejects forked or subagent structural callers', async () => {
        const fixture = await prepare('lineage-reject');
        const auth = getForgeAuthorizationByRequest(
            fixture.value.db, fixture.pending.receipt_id,
        )!;
        for (const overrides of [
            { forked_from_thread_id: fixture.session.threadId },
            { subagent_kind: 'worker' },
        ]) {
            await assert.rejects(
                verifyForgeExecutionAuthorization(
                    fixture.value.db,
                    getForgeRequest(fixture.value.db, fixture.pending.receipt_id)!,
                    auth.operator_authorization_ref,
                    validRequestContext(fixture.session.threadId, randomUUID(), overrides),
                ),
                /codex_request_identity_rejects_parent_fork_or_subagent/,
            );
        }
    });
});
