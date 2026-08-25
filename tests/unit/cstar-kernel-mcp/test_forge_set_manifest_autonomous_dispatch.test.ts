import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
    getForgeMissionGrantByRequest,
} from '../../../src/tools/pennyone/intel/forge_mission_grant_controller.js';
import {
    getForgeAuthorizationByRequest,
    getForgeRequest,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { handleForgeExecute } from '../../../src/tools/cstar-kernel-mcp/tools/forge_execute.js';
import { verifyForgeExecutionAuthorization } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_execution_authority.js';
import {
    appendUserMessage,
    validRequestContext,
} from './operator_authorization_test_support.js';
import {
    beginNaturalAuthorizationTest,
    cleanupNaturalAuthorizationTest,
    requestArgs,
} from './forge_natural_authorization_test_support.js';
import {
    MISSION_CHILDREN,
    MISSION_DECISION,
    MISSION_PARENT,
    appendMissionTurn,
    appendSetTurnRecord,
    createMissionFixture,
    requestMissionChild,
    rewriteMissionMetadata,
    structuralMissionContext,
    writeMissionChildIdentity,
} from './forge_mission_grant_test_support.js';

beforeEach(beginNaturalAuthorizationTest);
afterEach(cleanupNaturalAuthorizationTest);

function stored(fixture: Awaited<ReturnType<typeof createMissionFixture>>, receiptId: string) {
    const request = getForgeRequest(fixture.value.db, receiptId)!;
    const authorization = getForgeAuthorizationByRequest(fixture.value.db, receiptId)!;
    return { request, authorization };
}

async function executeAuthority(
    fixture: Awaited<ReturnType<typeof createMissionFixture>>,
    receipt: Record<string, any>,
    context = structuralMissionContext(fixture),
) {
    const value = stored(fixture, receipt.receipt_id);
    return verifyForgeExecutionAuthorization(
        fixture.value.db,
        value.request,
        value.authorization.operator_authorization_ref,
        context,
    );
}

describe('same-root automatic SET Forge dispatch', () => {
    it('returns automatic request-scoped authorization without a public authorize prompt', async () => {
        const fixture = await createMissionFixture('automatic');
        const result = await requestMissionChild(fixture, 0);
        assert.equal(result.status, 'AUTHORIZED', JSON.stringify(result));
        assert.equal(result.request_status, 'AUTHORIZED');
        assert.equal(result.authorization_challenge, null);
        assert.match(result.operator_authorization_ref, /^cstar-forge-mission-grant:/);
        assert.match(result.next_action, /cstar_forge_execute.*later root-thread turn/i);
        assert.doesNotMatch(result.next_action, /cstar_forge_authorize|authorization prompt/i);
        assert.ok(getForgeMissionGrantByRequest(fixture.value.db, result.receipt_id));
    });

    it('preserves the immutable SET prefix across informational same-turn growth', async () => {
        const fixture = await createMissionFixture('informational-growth');
        const result = await requestMissionChild(fixture, 0);
        appendSetTurnRecord(
            fixture,
            'The request-scoped receipt remains unchanged; this adds no authority.',
        );
        const authority = await executeAuthority(fixture, result);
        assert.equal(authority.mode, 'autonomous_set_manifest_v1');
        assert.equal(authority.authorization.operator_record_count, 1);
    });

    it('rejects duplicate and non-operative SET-shaped growth without deleting the receipt', async () => {
        for (const [label, text] of [
            ['duplicate', 'SET'],
            ['suffix', 'SET now'],
            ['identifier-dot', 'SET.extra'],
            ['identifier-slash', 'SET/extra'],
            ['question', 'SET?'],
            ['modal', 'Maybe SET'],
            ['quoted', 'The report says "SET".'],
        ] as const) {
            const fixture = await createMissionFixture(`growth-${label}`);
            const result = await requestMissionChild(fixture, 0);
            appendSetTurnRecord(fixture, text);
            await assert.rejects(
                executeAuthority(fixture, result),
                /forge_set_manifest_operator_signal_ambiguous/,
            );
            assert.ok(getForgeAuthorizationByRequest(fixture.value.db, result.receipt_id));
        }
    });

    it('durably revokes after terse or explicit post-SET revocation', async () => {
        for (const [label, text] of [
            ['terse', 'Stop.'],
            ['explicit', 'Do not proceed.'],
            ['withdraw', 'Withdraw this.'],
            ['never-mind', 'Never mind.'],
        ] as const) {
            const fixture = await createMissionFixture(`revoked-${label}`);
            const result = await requestMissionChild(fixture, 0);
            appendSetTurnRecord(fixture, text);
            await assert.rejects(
                executeAuthority(fixture, result),
                /forge_set_manifest_operator_signal_revoked/,
            );
            assert.equal(getForgeMissionGrantByRequest(
                fixture.value.db, result.receipt_id,
            )!.status, 'REVOKED');
        }
    });

    it('authorizes the first request when it is created on a later root turn', async () => {
        const fixture = await createMissionFixture('later-first-request');
        const later = appendMissionTurn(
            fixture,
            'Materialize the already-SET first mission child.',
        );
        const result = await requestMissionChild(fixture, 0, later);
        assert.equal(result.status, 'AUTHORIZED', JSON.stringify(result));
        assert.equal((await executeAuthority(fixture, result, later)).mode,
            'autonomous_set_manifest_v1');
    });

    it('ignores revocation evidence that predates SET and rejects unsafe later timing', async () => {
        const safe = await createMissionFixture('pre-set-revocation');
        appendMissionTurn(safe, 'Stop.', -1_000);
        const safeContext = appendMissionTurn(
            safe,
            'Continue the already-SET bounded mission.',
        );
        const safeResult = await requestMissionChild(safe, 0, safeContext);
        assert.equal(safeResult.status, 'AUTHORIZED', JSON.stringify(safeResult));

        for (const label of ['equal', 'uninspectable'] as const) {
            const fixture = await createMissionFixture(`revocation-${label}`);
            const turn = randomUUID();
            appendUserMessage(
                fixture.session.sessionFile,
                turn,
                'Stop.',
                label === 'equal' ? fixture.session.timestamp : 'not-a-timestamp',
            );
            const current = appendMissionTurn(
                fixture,
                'Inspect the existing mission grant boundary.',
                25_000,
            );
            const result = await requestMissionChild(fixture, 0, current);
            assert.equal(
                result.error_code,
                label === 'equal'
                    ? 'forge_set_manifest_operator_signal_revoked'
                    : 'forge_set_manifest_operator_signal_uninspectable',
            );
            assert.equal(getForgeAuthorizationByRequest(
                fixture.value.db, result.receipt_id,
            ), null);
        }
    });

    it('authorizes a later committed child under the same grant', async () => {
        const fixture = await createMissionFixture('later-child');
        const first = await requestMissionChild(fixture, 0);
        const later = appendMissionTurn(fixture, 'Continue with the second committed child.');
        const second = await requestMissionChild(fixture, 1, later);
        assert.equal(second.status, 'AUTHORIZED', JSON.stringify(second));
        assert.equal(second.mission_grant_id, first.mission_grant_id);
        assert.notEqual(second.operator_authorization_ref, first.operator_authorization_ref);
    });

    it('rejects child materialization from a different root thread', async () => {
        const fixture = await createMissionFixture('cross-root-child');
        const otherThread = randomUUID();
        const otherIdentity = {
            ...fixture.setIdentity,
            session_id: otherThread,
            thread_id: otherThread,
        };
        writeMissionChildIdentity(fixture, 0, otherIdentity);
        const result = await requestMissionChild(fixture, 0);
        assert.match(result.error_code, /^forge_set_manifest_/);
        assert.equal(getForgeAuthorizationByRequest(
            fixture.value.db, result.receipt_id,
        ), null);
    });

    it('never executes directly from SET and accepts a later same-root structural caller', async () => {
        const fixture = await createMissionFixture('execution-turns');
        const result = await requestMissionChild(fixture, 0);
        await assert.rejects(
            executeAuthority(fixture, result, fixture.setContext),
            /forge_mission_grant_execute_requires_later_turn/,
        );
        const later = await executeAuthority(fixture, result);
        assert.equal(later.mode, 'autonomous_set_manifest_v1');
        assert.equal(later.authorization.operator_turn_id, fixture.session.turnId);
    });

    it('replays the same automatic receipt without asking for authorization', async () => {
        const fixture = await createMissionFixture('request-replay');
        const first = await requestMissionChild(fixture, 0);
        const replay = await requestMissionChild(fixture, 0);
        assert.equal(replay.status, 'AUTHORIZED', JSON.stringify(replay));
        assert.equal(replay.receipt_id, first.receipt_id);
        assert.equal(replay.operator_authorization_ref, first.operator_authorization_ref);
        assert.doesNotMatch(replay.next_action, /authorize/i);
        assert.equal(fixture.value.db.prepare(
            'SELECT COUNT(*) AS count FROM hall_forge_authorizations',
        ).get().count, 1);
    });

    it('rejects cross-thread execution and later revocation', async () => {
        const crossThread = await createMissionFixture('cross-thread-execute');
        const first = await requestMissionChild(crossThread, 0);
        const otherThread = randomUUID();
        await assert.rejects(
            executeAuthority(
                crossThread,
                first,
                validRequestContext(otherThread, randomUUID()),
            ),
            /forge_mission_grant_persisted_authority_invalid/,
        );

        const revoked = await createMissionFixture('later-revocation');
        const authorized = await requestMissionChild(revoked, 0);
        const revokedContext = appendMissionTurn(revoked, 'Stop the Forge work.');
        await assert.rejects(
            executeAuthority(revoked, authorized, revokedContext),
            /forge_set_manifest_operator_signal_revoked/,
        );
    });

    it('revalidates expiry, request bytes, and immutable manifest scope', async () => {
        const expired = await createMissionFixture('expired');
        const expiredResult = await requestMissionChild(expired, 0);
        expired.value.db.prepare(
            'UPDATE hall_forge_authorizations SET expires_at = 0 WHERE request_id = ?',
        ).run(expiredResult.receipt_id);
        expired.value.db.prepare(
            'UPDATE hall_forge_requests SET expires_at = 0 WHERE request_id = ?',
        ).run(expiredResult.receipt_id);
        await assert.rejects(
            executeAuthority(expired, expiredResult),
            /forge_exact_authorization_expired/,
        );

        const requestDrift = await createMissionFixture('request-drift');
        const driftResult = await requestMissionChild(requestDrift, 0);
        const request = getForgeRequest(requestDrift.value.db, driftResult.receipt_id)!;
        const summary = JSON.parse(request.request_summary_json);
        summary.scope = `${summary.scope} expanded`;
        requestDrift.value.db.prepare(
            'UPDATE hall_forge_requests SET request_summary_json = ? WHERE request_id = ?',
        ).run(JSON.stringify(summary), driftResult.receipt_id);
        await assert.rejects(
            executeAuthority(requestDrift, driftResult),
            /forge_mission_grant_request_summary_invalid/,
        );

        const manifestDrift = await createMissionFixture('manifest-drift');
        const manifestResult = await requestMissionChild(manifestDrift, 0);
        rewriteMissionMetadata(manifestDrift, MISSION_PARENT, (metadata) => {
            metadata.design_sha256 = 'e'.repeat(64);
        });
        await assert.rejects(
            executeAuthority(manifestDrift, manifestResult),
            /forge_mission_grant_design_or_scope_drift/,
        );
    });

    it('reaches execute preflight without requiring a current user record', async () => {
        const fixture = await createMissionFixture('execute-no-record');
        const result = await requestMissionChild(fixture, 0);
        const response = await handleForgeExecute({
            ...requestArgs(
                fixture.value,
                MISSION_CHILDREN[0],
                `${MISSION_DECISION}:batch-1`,
                fixture.session.threadId,
            ),
            forge_request_receipt_id: result.receipt_id,
            forge_request_decision_id: `${MISSION_DECISION}:batch-1`,
            forge_request_bead_id: MISSION_CHILDREN[0],
            execution_mode: 'live_authorized',
            execution_adapter_ref: 'missing-test-adapter',
            operator_authorization_ref: result.operator_authorization_ref,
            idempotency_key: 'mission-no-record-guard',
        }, structuralMissionContext(fixture));
        assert.equal(response.isError, true);
        assert.doesNotMatch(response.content[0].text, /codex_request_identity_turn_match_count:0/);
    });

    it('rejects forked and subagent structural callers', async () => {
        const fixture = await createMissionFixture('lineage-reject');
        const result = await requestMissionChild(fixture, 0);
        for (const overrides of [
            { forked_from_thread_id: fixture.session.threadId },
            { subagent_kind: 'worker' },
        ]) {
            await assert.rejects(
                executeAuthority(
                    fixture,
                    result,
                    validRequestContext(fixture.session.threadId, randomUUID(), overrides),
                ),
                /codex_request_identity_rejects_parent_fork_or_subagent/,
            );
        }
    });
});
