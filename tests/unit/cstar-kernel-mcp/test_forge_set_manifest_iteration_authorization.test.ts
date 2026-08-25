import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
    bindForgeContinuationRepairValidation,
    countForgeProviderAttempts,
    finalizeForgePreProviderContinuation,
    getForgeContinuationByAttempt,
} from '../../../src/tools/pennyone/intel/forge_continuation_controller.js';
import {
    getForgeMissionGrantByRequest,
} from '../../../src/tools/pennyone/intel/forge_mission_grant_controller.js';
import {
    finalizeForgeAttempt,
    getForgeAttempt,
    getForgeAuthorizationByRequest,
    getForgeRequest,
    reserveForgeAttempt,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import { verifyCodexRequestIdentity } from
    '../../../src/tools/cstar-kernel-mcp/tools/operator_authorization.js';
import {
    beginNaturalAuthorizationTest,
    cleanupNaturalAuthorizationTest,
} from './forge_natural_authorization_test_support.js';
import {
    MISSION_CHILDREN,
    MISSION_DESIGN,
    MISSION_PARENT,
    appendMissionTurn,
    createMissionFixture,
    requestMissionChild,
    rewriteMissionMetadata,
} from './forge_mission_grant_test_support.js';

beforeEach(beginNaturalAuthorizationTest);
afterEach(cleanupNaturalAuthorizationTest);

const ZERO_PROVIDER_PROOF = {
    provider_evidence_valid: true,
    provider_requests_started: 0,
    provider_requests_completed: 0,
    provider_requests_ambiguous: 0,
    provider_request_receipts: [],
    input_tokens: 0,
    output_tokens: 0,
    live_spend: false,
    live_spend_unknown: false,
    known_spend_observed: false,
};

type Fixture = Awaited<ReturnType<typeof createMissionFixture>>;

function receipt(fixture: Fixture, result: Record<string, any>) {
    const request = getForgeRequest(fixture.value.db, result.receipt_id)!;
    const authorization = getForgeAuthorizationByRequest(
        fixture.value.db, result.receipt_id,
    )!;
    return { request, authorization };
}

function reserve(
    fixture: Fixture,
    result: Record<string, any>,
    label: string,
    overrides: {
        retry_of_attempt_id?: string;
        continuation_runtime_sha256?: string;
    } = {},
) {
    const current = receipt(fixture, result);
    return reserveForgeAttempt(fixture.value.db, {
        request_id: current.request.request_id,
        authorization_id: current.authorization.authorization_id,
        idempotency_key: `iteration-${label}`,
        execution_receipt_id: `iteration-receipt-${label}`,
        adapter_ref: current.request.adapter_ref!,
        ...overrides,
    }).attempt;
}

function finishUnknown(fixture: Fixture, attemptId: string): void {
    finalizeForgeAttempt(fixture.value.db, {
        attempt_id: attemptId,
        status: 'UNKNOWN',
        result_status: 'synthetic-ambiguous',
        error_code: 'synthetic_unknown_spend',
    });
}

async function blockedChild(
    fixture: Fixture,
    index: number,
    text = 'Continue with the next bounded mission child.',
) {
    const context = appendMissionTurn(fixture, text);
    return requestMissionChild(fixture, index, context);
}

function preprovider(
    fixture: Fixture,
    attemptId: string,
    label: string,
) {
    return finalizeForgePreProviderContinuation(fixture.value.db, {
        attempt_id: attemptId,
        failure_code: 'forge_hermes_target_material_too_large',
        execution_trace_sha256: label.charCodeAt(0).toString(16).padStart(64, '0'),
        zero_provider_proof: ZERO_PROVIDER_PROOF,
        continuation_authority_sha256: '2'.repeat(64),
        prior_runtime_sha256: '3'.repeat(64),
    });
}

describe('post-SET mission iteration authorization', () => {
    it('blocks every child and retry after UNKNOWN spend', async () => {
        const fixture = await createMissionFixture('unknown-blocks', 3);
        const first = await requestMissionChild(fixture, 0);
        const attempt = reserve(fixture, first, 'unknown-parent');
        finishUnknown(fixture, attempt.attempt_id);
        const grant = getForgeMissionGrantByRequest(
            fixture.value.db, first.receipt_id,
        )!;
        assert.equal(grant.status, 'BLOCKED');
        assert.equal(grant.blocked_reason, 'synthetic_unknown_spend');
        assert.equal(getForgeRequest(
            fixture.value.db, first.receipt_id,
        )!.status, 'AMBIGUOUS');

        const second = await blockedChild(fixture, 1);
        assert.equal(second.error_code, 'forge_mission_grant_not_active');
        assert.throws(
            () => reserve(fixture, first, 'unknown-retry', {
                retry_of_attempt_id: attempt.attempt_id,
            }),
            /forge_request_not_authorized:AMBIGUOUS/,
        );
    });

    it('does not let legacy iteration metadata reopen an ambiguous mission', async () => {
        const fixture = await createMissionFixture('legacy-iteration-blocked', 2);
        const first = await requestMissionChild(fixture, 0);
        finishUnknown(fixture, reserve(fixture, first, 'legacy-parent').attempt_id);
        const later = appendMissionTurn(
            fixture,
            'Continue after independently inspecting the ambiguous outcome.',
        );
        const laterIdentity = await verifyCodexRequestIdentity(later);
        rewriteMissionMetadata(fixture, MISSION_CHILDREN[1], (metadata) => {
            delete metadata.depends_on;
            Object.assign(metadata, {
                schema: 'cstar.set_manifest_iteration.v1',
                parent_bead_id: MISSION_PARENT,
                iteration_of: MISSION_CHILDREN[0],
                order: 2,
                design_sha256: MISSION_DESIGN,
                owning_lane: 'Forge',
                max_attempts: 1,
                retry_budget: 0,
                live_source_allowed: false,
                fixture_policy: 'synthetic_only',
                predecessor_request_sha256: first.request_sha256,
                mutation_request_identity: {
                    source: 'codex_request_meta',
                    thread_id: laterIdentity.thread_id,
                    turn_id: laterIdentity.turn_id,
                    turn_record_set_sha256: laterIdentity.turn_record_set_sha256,
                },
                authority_tier: 'reference',
                archived: false,
            });
        });
        const second = await requestMissionChild(fixture, 1, later);
        assert.match(
            second.error_code,
            /^forge_set_manifest_iteration_(?:order_gap|predecessor_not_authoritative)$/,
        );
        assert.equal(getForgeAuthorizationByRequest(
            fixture.value.db, second.receipt_id,
        ), null);
        assert.equal(getForgeMissionGrantByRequest(
            fixture.value.db, first.receipt_id,
        )!.status, 'BLOCKED');
    });

    it('keeps the lineage blocked after repeated child requests', async () => {
        const fixture = await createMissionFixture('repeated-child-block', 3);
        const first = await requestMissionChild(fixture, 0);
        finishUnknown(fixture, reserve(fixture, first, 'repeated-parent').attempt_id);
        const second = await blockedChild(fixture, 1, 'Try the second bounded child.');
        const third = await blockedChild(fixture, 2, 'Try the third bounded child.');
        assert.equal(second.error_code, 'forge_mission_grant_not_active');
        assert.equal(third.error_code, 'forge_mission_grant_not_active');
        assert.equal(getForgeMissionGrantByRequest(
            fixture.value.db, first.receipt_id,
        )!.status, 'BLOCKED');
    });

    it('allows a proven zero-provider continuation without consuming capacity', async () => {
        const fixture = await createMissionFixture('zero-provider', 2);
        const first = await requestMissionChild(fixture, 0);
        const parentAttempt = reserve(fixture, first, 'zero-parent');
        const continuation = preprovider(fixture, parentAttempt.attempt_id, 'a');
        assert.equal(continuation.status, 'PENDING_REPAIR');
        assert.equal(getForgeAttempt(
            fixture.value.db, parentAttempt.attempt_id,
        )!.attempt_budget_class, 'mechanical_no_provider');
        assert.equal(countForgeProviderAttempts(
            fixture.value.db, first.receipt_id,
        ), 0);
        assert.equal(getForgeMissionGrantByRequest(
            fixture.value.db, first.receipt_id,
        )!.status, 'ACTIVE');

        assert.throws(
            () => reserve(fixture, first, 'zero-unvalidated', {
                retry_of_attempt_id: parentAttempt.attempt_id,
                continuation_runtime_sha256: '3'.repeat(64),
            }),
            /forge_continuation_repair_validation_required/,
        );
        bindForgeContinuationRepairValidation(
            fixture.value.db,
            parentAttempt.attempt_id,
            'validation:mission-zero-provider',
            'a'.repeat(64),
        );
        const resumed = reserve(fixture, first, 'zero-resumed', {
            retry_of_attempt_id: parentAttempt.attempt_id,
            continuation_runtime_sha256: '3'.repeat(64),
        });
        assert.equal(resumed.ordinal, 2);
        assert.equal(getForgeContinuationByAttempt(
            fixture.value.db, parentAttempt.attempt_id,
        )!.status, 'RESUMED');
        assert.equal(countForgeProviderAttempts(
            fixture.value.db, first.receipt_id,
        ), 1);
    });

    it('never reclassifies UNKNOWN as a zero-provider continuation', async () => {
        const fixture = await createMissionFixture('unknown-not-zero-provider', 2);
        const first = await requestMissionChild(fixture, 0);
        const attempt = reserve(fixture, first, 'unknown-final');
        finishUnknown(fixture, attempt.attempt_id);
        assert.throws(
            () => preprovider(fixture, attempt.attempt_id, 'b'),
            /forge_preprovider_attempt_transition_invalid:UNKNOWN/,
        );
        assert.equal(getForgeMissionGrantByRequest(
            fixture.value.db, first.receipt_id,
        )!.status, 'BLOCKED');
    });

    it('still rejects target and retry widening before authorization is derived', async () => {
        const scope = await createMissionFixture('target-widening', 2);
        const first = await requestMissionChild(scope, 0);
        assert.equal(first.status, 'AUTHORIZED');
        const later = appendMissionTurn(scope, 'Continue with the second child.');
        const widenedChild = await requestMissionChild(scope, 1, later, (args) => {
            args.target_paths = [scope.value.root];
        });
        assert.equal(widenedChild.error_code, 'forge_mission_grant_request_scope_widened');

        const retry = await createMissionFixture('retry-widening', 2);
        const rejected = await requestMissionChild(retry, 0, retry.setContext, (args) => {
            args.spend_policy.max_retries = 1;
            args.retry_policy = { budget: 1, spent: 0 };
        });
        assert.equal(rejected.status, 'rejected', JSON.stringify(rejected));
        assert.equal(rejected.error_code, 'forge_request_contract_invalid');
    });
});
