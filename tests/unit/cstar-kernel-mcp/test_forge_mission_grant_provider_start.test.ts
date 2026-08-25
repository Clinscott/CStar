import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
    getForgeAuthorizationByRequest,
    getForgeAttempt,
    getForgeRequest,
    markForgeAttemptStarted,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { getForgeMissionGrantByRequest } from
    '../../../src/tools/pennyone/intel/forge_mission_grant_controller.js';
import { reserveVerifiedForgeExecution } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_execute_reservation.js';
import type { ForgeExecutionArgs } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_execute_contract.js';
import type { CanonicalForgeRequest } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_request_contract.js';
import { appendUserMessage } from './operator_authorization_test_support.js';
import {
    createMissionFixture,
    MISSION_CHILDREN,
    MISSION_DECISION,
    requestMissionChild,
} from './forge_mission_grant_test_support.js';
import {
    beginNaturalAuthorizationTest,
    cleanupNaturalAuthorizationTest,
    requestArgs,
} from './forge_natural_authorization_test_support.js';

beforeEach(beginNaturalAuthorizationTest);
afterEach(cleanupNaturalAuthorizationTest);

async function reservedMission(label: string) {
    const fixture = await createMissionFixture(label, 1);
    const authorized = await requestMissionChild(fixture, 0);
    const request = getForgeRequest(fixture.value.db, authorized.receipt_id)!;
    const authorization = getForgeAuthorizationByRequest(
        fixture.value.db, request.request_id,
    )!;
    const base = requestArgs(
        fixture.value, MISSION_CHILDREN[0]!,
        `${MISSION_DECISION}:batch-1`, fixture.session.threadId,
    );
    const args: ForgeExecutionArgs = {
        ...base,
        forge_request_receipt_id: request.request_id,
        forge_request_decision_id: request.decision_id,
        forge_request_bead_id: request.bead_id,
        execution_mode: 'live_authorized',
        execution_adapter_ref: request.adapter_ref,
        operator_authorization_ref: authorization.operator_authorization_ref,
        idempotency_key: `provider-start-${label}`,
    };
    const reserve = () => reserveVerifiedForgeExecution({
        root: fixture.value.root,
        request,
        authorization,
        args,
        executionReceiptId: `execution-provider-start-${label}`,
        adapterRef: request.adapter_ref!,
        canonical: JSON.parse(request.request_summary_json) as CanonicalForgeRequest,
    });
    const reservation = reserve();
    assert.equal(reservation.kind, 'reserved');
    return { fixture, request, reservation, reserve };
}

describe('Forge mission-grant provider-start gate', () => {
    it('starts only after an unchanged bound root-session snapshot', async () => {
        const value = await reservedMission('unchanged');
        const started = markForgeAttemptStarted(
            value.reservation.db, value.reservation.attempt.attempt_id,
        );
        assert.equal(started.status, 'STARTED');
        assert.ok(started.spawn_started_at);
        assert.equal(getForgeMissionGrantByRequest(
            value.reservation.db, value.request.request_id,
        )!.status, 'ACTIVE');
    });

    it('rolls back STARTED and revokes after a pre-provider revocation race', async () => {
        const value = await reservedMission('revoked-race');
        let spawnEligible = false;
        assert.throws(() => {
            markForgeAttemptStarted(
                value.reservation.db,
                value.reservation.attempt.attempt_id,
                {
                    beforeProviderStart: () => appendUserMessage(
                        value.fixture.session.sessionFile,
                        randomUUID(),
                        'Revoke this.',
                        new Date().toISOString(),
                    ),
                },
            );
            spawnEligible = true;
        }, /forge_set_manifest_operator_signal_revoked/);
        const attempt = getForgeAttempt(
            value.reservation.db, value.reservation.attempt.attempt_id,
        )!;
        assert.equal(spawnEligible, false);
        assert.equal(attempt.status, 'RESERVED');
        assert.equal(attempt.spawn_started_at, undefined);
        assert.equal(getForgeMissionGrantByRequest(
            value.reservation.db, value.request.request_id,
        )!.status, 'REVOKED');
        assert.equal(getForgeRequest(
            value.reservation.db, value.request.request_id,
        )!.status, 'REVOKED');
    });

    it('refuses non-revoking post-reservation drift under exact binding', async () => {
        const value = await reservedMission('informational-drift');
        appendUserMessage(
            value.fixture.session.sessionFile,
            randomUUID(),
            'Informational note only.',
            new Date().toISOString(),
        );
        assert.throws(() => markForgeAttemptStarted(
            value.reservation.db, value.reservation.attempt.attempt_id,
        ), /forge_mission_grant_root_session_drift_before_provider_start/);
        assert.equal(getForgeAttempt(
            value.reservation.db, value.reservation.attempt.attempt_id,
        )!.status, 'RESERVED');
        assert.equal(getForgeMissionGrantByRequest(
            value.reservation.db, value.request.request_id,
        )!.status, 'BLOCKED');
        assert.equal(getForgeRequest(
            value.reservation.db, value.request.request_id,
        )!.status, 'REVOKED');
    });

    it('replays reservation idempotently and refuses a second STARTED transition', async () => {
        const value = await reservedMission('replay');
        markForgeAttemptStarted(
            value.reservation.db, value.reservation.attempt.attempt_id,
        );
        assert.throws(() => markForgeAttemptStarted(
            value.reservation.db, value.reservation.attempt.attempt_id,
        ), /forge_attempt_start_transition_invalid/);
        const replay = value.reserve();
        assert.equal(replay.kind, 'replay');
        assert.equal(replay.attempt.attempt_id, value.reservation.attempt.attempt_id);
        assert.equal(replay.attempt.status, 'STARTED');
        assert.equal(value.reservation.db.prepare(
            'SELECT COUNT(*) FROM hall_forge_attempts WHERE request_id = ?',
        ).pluck().get(value.request.request_id), 1);
        assert.equal(getForgeMissionGrantByRequest(
            value.reservation.db, value.request.request_id,
        )!.status, 'ACTIVE');
    });
});
