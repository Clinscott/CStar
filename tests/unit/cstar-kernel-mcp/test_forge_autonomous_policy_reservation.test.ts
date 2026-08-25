import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
    getForgeAuthorizationByRequest,
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
import {
    appendAutonomousPolicySameTurnRecord,
    beginAutonomousPolicyTest,
    cleanupAutonomousPolicyTest,
    createAutonomousPolicyFixture,
    requestAutonomousPolicyChild,
} from './forge_autonomous_policy_test_support.js';

beforeEach(beginAutonomousPolicyTest);
afterEach(cleanupAutonomousPolicyTest);

function executionArgs(
    fixture: Awaited<ReturnType<typeof createAutonomousPolicyFixture>>,
    requestId: string,
): { args: ForgeExecutionArgs; canonical: CanonicalForgeRequest } {
    const request = getForgeRequest(fixture.value.db, requestId)!;
    const authorization = getForgeAuthorizationByRequest(fixture.value.db, requestId)!;
    const canonical = JSON.parse(request.request_summary_json) as CanonicalForgeRequest;
    return {
        canonical,
        args: {
            ...canonical,
            forge_request_receipt_id: requestId,
            forge_request_decision_id: request.decision_id,
            forge_request_bead_id: request.bead_id,
            execution_mode: 'live_authorized',
            execution_adapter_ref: request.adapter_ref!,
            operator_authorization_ref: authorization.operator_authorization_ref,
            idempotency_key: `policy-reservation-${requestId}`,
        } as ForgeExecutionArgs,
    };
}

describe('autonomous dispatch policy reservation', () => {
    it('uses the policy signal instead of requiring a SET record', async () => {
        const fixture = await createAutonomousPolicyFixture('reservation');
        const result = await requestAutonomousPolicyChild(fixture);
        const request = getForgeRequest(fixture.value.db, result.receipt_id)!;
        const authorization = getForgeAuthorizationByRequest(fixture.value.db, result.receipt_id)!;
        const { args, canonical } = executionArgs(fixture, result.receipt_id);

        const reservation = reserveVerifiedForgeExecution({
            root: fixture.value.root,
            request,
            authorization,
            args,
            executionReceiptId: 'execution-policy-reservation',
            adapterRef: request.adapter_ref!,
            canonical,
        });

        assert.equal(reservation.kind, 'reserved');
        assert.equal(getForgeMissionGrantByRequest(
            fixture.value.db, result.receipt_id,
        )!.status, 'ACTIVE');
        assert.equal(
            markForgeAttemptStarted(reservation.db, reservation.attempt.attempt_id).status,
            'STARTED',
        );
        reservation.db.close();
    });

    it('rejects a policy revocation that lands during reservation', async () => {
        const fixture = await createAutonomousPolicyFixture('reservation-revocation');
        const result = await requestAutonomousPolicyChild(fixture);
        const request = getForgeRequest(fixture.value.db, result.receipt_id)!;
        const authorization = getForgeAuthorizationByRequest(fixture.value.db, result.receipt_id)!;
        const { args, canonical } = executionArgs(fixture, result.receipt_id);

        assert.throws(() => reserveVerifiedForgeExecution({
            root: fixture.value.root,
            request,
            authorization,
            args,
            executionReceiptId: 'execution-policy-revocation',
            adapterRef: request.adapter_ref!,
            canonical,
            beforeReservation: () => {
                appendAutonomousPolicySameTurnRecord(fixture, 'Stop.');
            },
        }), /forge_autonomous_policy_revoked/);
        assert.equal(fixture.value.db.prepare(
            'SELECT COUNT(*) FROM hall_forge_attempts WHERE request_id = ?',
        ).pluck().get(result.receipt_id), 0);
        assert.equal(getForgeMissionGrantByRequest(
            fixture.value.db, result.receipt_id,
        )!.status, 'REVOKED');
    });
});
