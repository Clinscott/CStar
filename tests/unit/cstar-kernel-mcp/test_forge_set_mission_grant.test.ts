import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
    assertForgeMissionGrantActive,
    getForgeMissionGrantByRequest,
} from '../../../src/tools/pennyone/intel/forge_mission_grant_controller.js';
import {
    finalizeForgeAttempt,
    getForgeAuthorizationByRequest,
    getForgeRequest,
    markForgeAttemptStarted,
    reserveForgeAttempt,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { verifyForgeExecutionAuthorization } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_execution_authority.js';
import { reserveVerifiedForgeExecution } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_execute_reservation.js';
import type { ForgeExecutionArgs } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_execute_contract.js';
import type { CanonicalForgeRequest } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_request_contract.js';
import { FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS }
    from '../../../src/types/forge.js';
import { bindForgeMissionGrantEnvelopeMetadata }
    from '../../../src/tools/pennyone/intel/forge_mission_grant_envelope.js';
import { handleForgeRequest } from '../../../src/tools/cstar-kernel-mcp/tools/forge_request.js';
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

const PARENT = 'bead:cstar:mission-grant:test';
const CHILDREN = ['bead:cstar:mission-grant:01', 'bead:cstar:mission-grant:02'];
const DECISION = 'decision:cstar-mission-grant:test';
const DESIGN = '7'.repeat(64);

beforeEach(beginNaturalAuthorizationTest);
afterEach(cleanupNaturalAuthorizationTest);

async function missionFixture(label: string) {
    const value = setupRoot(label);
    const session = createSession({
        textParts: ['SET'],
        timestamp: new Date(Date.now() - 10_000).toISOString(),
    });
    const context = validRequestContext(session.threadId, session.turnId);
    const identity = await verifyCodexRequestIdentity(context);
    const mutation = {
        source: 'codex_request_meta',
        thread_id: identity.thread_id,
        turn_id: identity.turn_id,
        turn_record_set_sha256: identity.turn_record_set_sha256,
    };
    insertBead(value, PARENT, DECISION);
    CHILDREN.forEach((child, index) => insertBead(
        value, child, `${DECISION}:batch-${index + 1}`,
    ));
    value.db.prepare('UPDATE hall_beads SET metadata_json = ? WHERE bead_id = ?').run(
        JSON.stringify(bindForgeMissionGrantEnvelopeMetadata({
            source: 'cstar-kernel-mcp',
            schema: 'cstar.set_manifest.v1',
            decision_id: DECISION,
            design_revision: 1,
            design_sha256: DESIGN,
            batch_order: CHILDREN,
            operator_set: true,
            mission_grant_envelope: {
                schema: 'cstar.forge_mission_grant_envelope.v1',
                allowed_targets: [value.target],
                allowed_outputs: [value.target],
                allowed_actions: ['response_only', 'validation_artifacts'],
                prohibited_actions: [
                    ...FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS,
                    'project_files',
                    'authorized_source_collection',
                ],
                adapter_ref: 'cstar-forge-hermes-minimax-adapter',
                write_capability: 'response_only',
                total_provider_attempt_ceiling: CHILDREN.length,
                retry_derived_iteration_ceiling: 0,
                paid_attempt_ceiling: CHILDREN.length,
            },
            mutation_request_identity: mutation,
        })),
        PARENT,
    );
    CHILDREN.forEach((child, index) => value.db.prepare(
        'UPDATE hall_beads SET metadata_json = ? WHERE bead_id = ?',
    ).run(JSON.stringify({
        source: 'cstar-kernel-mcp',
        parent_bead_id: PARENT,
        order: index + 1,
        depends_on: index === 0 ? [] : [CHILDREN[index - 1]],
        design_sha256: DESIGN,
        owning_lane: 'Forge',
        mutation_request_identity: mutation,
    }), child));
    return { value, session, context };
}

async function requestChild(
    fixture: Awaited<ReturnType<typeof missionFixture>>,
    index: number,
    context = fixture.context,
    mutate?: (args: ReturnType<typeof requestArgs>) => void,
) {
    const args = requestArgs(
        fixture.value,
        CHILDREN[index]!,
        `${DECISION}:batch-${index + 1}`,
        fixture.session.threadId,
    );
    mutate?.(args);
    return parse(await handleForgeRequest(
        args,
        context,
    ));
}

function reserve(fixture: Awaited<ReturnType<typeof missionFixture>>, receiptId: string) {
    const authorization = getForgeAuthorizationByRequest(fixture.value.db, receiptId)!;
    return reserveForgeAttempt(fixture.value.db, {
        request_id: receiptId,
        authorization_id: authorization.authorization_id,
        idempotency_key: `mission-${receiptId}`,
        execution_receipt_id: `execution-${receiptId}`,
        adapter_ref: 'cstar-forge-hermes-minimax-adapter',
        provider: 'synthetic-provider',
    });
}

describe('durable Forge mission grants', () => {
    it('authorizes allowed children on later root turns and never executes from SET', async () => {
        const fixture = await missionFixture('children');
        const first = await requestChild(fixture, 0);
        assert.equal(first.status, 'AUTHORIZED', JSON.stringify(first));
        const firstGrant = getForgeMissionGrantByRequest(
            fixture.value.db, first.receipt_id,
        )!;
        assert.equal(firstGrant.status, 'ACTIVE');
        assert.equal(firstGrant.total_provider_attempt_ceiling, 2);

        const firstRequest = getForgeRequest(fixture.value.db, first.receipt_id)!;
        await assert.rejects(() => verifyForgeExecutionAuthorization(
            fixture.value.db, firstRequest, first.operator_authorization_ref,
            fixture.context,
        ), /forge_mission_grant_execute_requires_later_turn/);

        const laterTurn = randomUUID();
        appendUserMessage(
            fixture.session.sessionFile,
            laterTurn,
            'Continue with the next bounded mission child.',
            new Date(Date.now() - 1_000).toISOString(),
        );
        const laterContext = validRequestContext(fixture.session.threadId, laterTurn);
        const second = await requestChild(fixture, 1, laterContext);
        assert.equal(second.status, 'AUTHORIZED', JSON.stringify(second));
        assert.equal(second.mission_grant_id, first.mission_grant_id);
        assert.notEqual(second.operator_authorization_ref, first.operator_authorization_ref);
        const secondRequest = getForgeRequest(fixture.value.db, second.receipt_id)!;
        const authority = await verifyForgeExecutionAuthorization(
            fixture.value.db, secondRequest, second.operator_authorization_ref, laterContext,
        );
        assert.equal(authority.mode, 'autonomous_set_manifest_v1');
    });

    it('uses the SET envelope instead of poisoning the grant from its first child', async () => {
        const fixture = await missionFixture('first-child-envelope');
        const first = await requestChild(fixture, 0);
        const laterTurn = randomUUID();
        appendUserMessage(
            fixture.session.sessionFile,
            laterTurn,
            'Continue with the validation-artifact child.',
            new Date(Date.now() - 1_000).toISOString(),
        );
        const second = await requestChild(
            fixture,
            1,
            validRequestContext(fixture.session.threadId, laterTurn),
            (args) => { args.requested_actions.push('validation_artifacts'); },
        );
        assert.equal(second.status, 'AUTHORIZED', JSON.stringify(second));
        assert.equal(second.mission_grant_id, first.mission_grant_id);
        const grant = getForgeMissionGrantByRequest(
            fixture.value.db, second.receipt_id,
        )!;
        assert.deepEqual(
            JSON.parse(grant.allowed_actions_json),
            ['response_only', 'validation_artifacts'],
        );
        assert.ok(FORGE_MISSION_GRANT_MANDATORY_PROHIBITED_ACTIONS.every(
            (action) => JSON.parse(grant.prohibited_actions_json).includes(action),
        ));
    });

    it('rejects immutable grant-envelope drift during child materialization replay', async () => {
        const fixture = await missionFixture('grant-replay-drift');
        const first = await requestChild(fixture, 0);
        fixture.value.db.prepare(`
            UPDATE hall_forge_mission_grants
            SET allowed_targets_json = ?
            WHERE mission_grant_id = ?
        `).run(JSON.stringify(['/synthetic/widened']), first.mission_grant_id);
        const laterTurn = randomUUID();
        appendUserMessage(
            fixture.session.sessionFile,
            laterTurn,
            'Continue with the next bounded mission child.',
            new Date(Date.now() - 1_000).toISOString(),
        );
        const second = await requestChild(
            fixture, 1, validRequestContext(fixture.session.threadId, laterTurn),
        );
        assert.equal(
            second.error_code,
            'forge_mission_grant_materialization_conflict',
            JSON.stringify(second),
        );
    });

    it('rolls back reservation when revocation lands after precheck', async () => {
        const fixture = await missionFixture('reservation-revocation-race');
        const authorized = await requestChild(fixture, 0);
        const request = getForgeRequest(fixture.value.db, authorized.receipt_id)!;
        const authorization = getForgeAuthorizationByRequest(
            fixture.value.db, request.request_id,
        )!;
        const base = requestArgs(
            fixture.value, CHILDREN[0]!, `${DECISION}:batch-1`,
            fixture.session.threadId,
        );
        const args: ForgeExecutionArgs = {
            ...base,
            forge_request_receipt_id: request.request_id,
            forge_request_decision_id: request.decision_id,
            forge_request_bead_id: request.bead_id,
            execution_mode: 'live_authorized',
            execution_adapter_ref: request.adapter_ref,
            operator_authorization_ref: authorization.operator_authorization_ref,
            idempotency_key: 'reservation-revocation-race',
        };
        assert.throws(() => reserveVerifiedForgeExecution({
            root: fixture.value.root,
            request,
            authorization,
            args,
            executionReceiptId: 'execution-reservation-revocation-race',
            adapterRef: request.adapter_ref!,
            canonical: JSON.parse(request.request_summary_json) as CanonicalForgeRequest,
            beforeReservation: () => appendUserMessage(
                fixture.session.sessionFile,
                randomUUID(),
                'Revoke this.',
                new Date().toISOString(),
            ),
        }), /forge_set_manifest_operator_signal_revoked/);
        assert.equal(fixture.value.db.prepare(
            'SELECT COUNT(*) FROM hall_forge_attempts WHERE request_id = ?',
        ).pluck().get(request.request_id), 0);
        assert.equal(fixture.value.db.prepare(
            'SELECT COUNT(*) FROM hall_forge_mission_grant_reservations WHERE request_id = ?',
        ).pluck().get(request.request_id), 0);
        assert.equal(getForgeRequest(
            fixture.value.db, request.request_id,
        )!.active_attempt_id, undefined);
        assert.equal(getForgeMissionGrantByRequest(
            fixture.value.db, request.request_id,
        )!.status, 'REVOKED');
    });

    it('binds the fresh root-session snapshot to provider eligibility', async () => {
        const fixture = await missionFixture('reservation-snapshot');
        const authorized = await requestChild(fixture, 0);
        const request = getForgeRequest(fixture.value.db, authorized.receipt_id)!;
        const authorization = getForgeAuthorizationByRequest(
            fixture.value.db, request.request_id,
        )!;
        const base = requestArgs(
            fixture.value, CHILDREN[0]!, `${DECISION}:batch-1`,
            fixture.session.threadId,
        );
        const reservation = reserveVerifiedForgeExecution({
            root: fixture.value.root,
            request,
            authorization,
            args: {
                ...base,
                forge_request_receipt_id: request.request_id,
                forge_request_decision_id: request.decision_id,
                forge_request_bead_id: request.bead_id,
                execution_mode: 'live_authorized',
                execution_adapter_ref: request.adapter_ref,
                operator_authorization_ref: authorization.operator_authorization_ref,
                idempotency_key: 'reservation-snapshot',
            },
            executionReceiptId: 'execution-reservation-snapshot',
            adapterRef: request.adapter_ref!,
            canonical: JSON.parse(request.request_summary_json) as CanonicalForgeRequest,
        });
        const fact = fixture.value.db.prepare(`
            SELECT * FROM hall_forge_mission_grant_reservations
            WHERE attempt_id = ?
        `).get(reservation.attempt.attempt_id) as Record<string, unknown>;
        assert.equal(fact.request_id, request.request_id);
        assert.equal(fact.set_turn_id, fixture.session.turnId);
        assert.match(String(fact.root_session_record_set_sha256), /^[a-f0-9]{64}$/);
        assert.ok(Number(fact.root_session_record_count) >= 1);
        assert.equal(
            markForgeAttemptStarted(
                reservation.db, reservation.attempt.attempt_id,
            ).status,
            'STARTED',
        );
        reservation.db.close();
    });

    it('blocks the complete grant after unknown spend and refuses another child', async () => {
        const fixture = await missionFixture('unknown');
        const first = await requestChild(fixture, 0);
        const attempt = reserve(fixture, first.receipt_id).attempt;
        finalizeForgeAttempt(fixture.value.db, {
            attempt_id: attempt.attempt_id,
            status: 'UNKNOWN',
            error_code: 'synthetic_unknown_spend',
        });
        const grant = getForgeMissionGrantByRequest(fixture.value.db, first.receipt_id)!;
        assert.equal(grant.status, 'BLOCKED');

        const laterTurn = randomUUID();
        appendUserMessage(
            fixture.session.sessionFile,
            laterTurn,
            'Continue with the next bounded mission child.',
            new Date(Date.now() - 1_000).toISOString(),
        );
        const second = await requestChild(
            fixture, 1, validRequestContext(fixture.session.threadId, laterTurn),
        );
        assert.equal(second.error_code, 'forge_mission_grant_not_active');
    });

    it('enforces aggregate provider capacity across child receipts', async () => {
        const fixture = await missionFixture('capacity');
        const first = await requestChild(fixture, 0);
        const firstAttempt = reserve(fixture, first.receipt_id).attempt;
        finalizeForgeAttempt(fixture.value.db, {
            attempt_id: firstAttempt.attempt_id,
            status: 'SUCCEEDED',
            result_status: 'synthetic_success',
        });
        const laterTurn = randomUUID();
        appendUserMessage(
            fixture.session.sessionFile,
            laterTurn,
            'Continue with the next bounded mission child.',
            new Date(Date.now() - 1_000).toISOString(),
        );
        const laterContext = validRequestContext(fixture.session.threadId, laterTurn);
        const second = await requestChild(fixture, 1, laterContext);
        reserve(fixture, second.receipt_id);
        const grant = getForgeMissionGrantByRequest(fixture.value.db, second.receipt_id)!;
        assert.throws(
            () => assertForgeMissionGrantActive(
                fixture.value.db, grant, Date.now(),
            ),
            /forge_mission_grant_capacity_exhausted/,
        );
    });

    it('fails closed on expiry and durably records explicit revocation', async () => {
        const expiredFixture = await missionFixture('expiry');
        const expiredRequest = await requestChild(expiredFixture, 0);
        const expiringGrant = getForgeMissionGrantByRequest(
            expiredFixture.value.db, expiredRequest.receipt_id,
        )!;
        assert.throws(
            () => assertForgeMissionGrantActive(
                expiredFixture.value.db, expiringGrant, expiringGrant.expires_at,
            ),
            /forge_mission_grant_expired/,
        );

        const revokedFixture = await missionFixture('revocation');
        const authorized = await requestChild(revokedFixture, 0);
        const laterTurn = randomUUID();
        appendUserMessage(
            revokedFixture.session.sessionFile,
            laterTurn,
            'Stop.',
            new Date().toISOString(),
        );
        const request = getForgeRequest(revokedFixture.value.db, authorized.receipt_id)!;
        await assert.rejects(() => verifyForgeExecutionAuthorization(
            revokedFixture.value.db, request, authorized.operator_authorization_ref,
            validRequestContext(revokedFixture.session.threadId, laterTurn),
        ), /forge_set_manifest_operator_signal_revoked/);
        assert.equal(getForgeMissionGrantByRequest(
            revokedFixture.value.db, authorized.receipt_id,
        )!.status, 'REVOKED');
    });
});
