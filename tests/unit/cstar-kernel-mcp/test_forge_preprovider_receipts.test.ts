import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    bindForgeContinuationRepairValidation,
    countForgeProviderAttempts,
    finalizeForgePreProviderContinuation,
    getForgeContinuationByAttempt,
} from '../../../src/tools/pennyone/intel/forge_continuation_controller.js';
import {
    finalizeForgeAttempt,
    getForgeAttempt,
    getForgeRequest,
    reserveForgeAttempt,
} from '../../../src/tools/pennyone/intel/forge_receipt_controller.js';
import {
    cleanupForgeReceiptFixtures,
    createForgeReceiptFixture,
    forgeRequestInput,
    insertForgeReceiptBead,
    saveAndAuthorizeForgeRequest,
} from './forge_receipt_test_support.js';

afterEach(cleanupForgeReceiptFixtures);

const zeroProof = {
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

function setup(label: string) {
    const fixture = createForgeReceiptFixture();
    const beadId = `bead:test:${label}`;
    insertForgeReceiptBead(fixture.db, fixture.repoId, beadId);
    const request = forgeRequestInput(fixture.repoId, beadId);
    const authorization = saveAndAuthorizeForgeRequest(fixture.db, request).authorization;
    const attempt = reserveForgeAttempt(fixture.db, {
        request_id: request.request_id,
        authorization_id: authorization.authorization_id,
        idempotency_key: `${label}-parent`,
        execution_receipt_id: `${label}-parent-receipt`,
        adapter_ref: request.adapter_ref!,
    }).attempt;
    return { ...fixture, request, authorization, attempt };
}

function record(fixture: ReturnType<typeof setup>, reconcile = false) {
    return finalizeForgePreProviderContinuation(fixture.db, {
        attempt_id: fixture.attempt.attempt_id,
        failure_code: 'forge_hermes_target_material_too_large',
        execution_trace_sha256: '1'.repeat(64),
        zero_provider_proof: zeroProof,
        continuation_authority_sha256: '2'.repeat(64),
        prior_runtime_sha256: '3'.repeat(64),
        reconcile_failed_final: reconcile,
    });
}

function bind(fixture: ReturnType<typeof setup>, attemptId: string, label: string) {
    return bindForgeContinuationRepairValidation(
        fixture.db, attemptId, `validation:${label}`, 'a'.repeat(64),
    );
}

describe('durable pre-provider continuation receipts', () => {
    it('accounts a mechanical cycle without consuming provider budget', () => {
        const fixture = setup('mechanical');
        const continuation = record(fixture);
        const attempt = getForgeAttempt(fixture.db, fixture.attempt.attempt_id)!;
        assert.equal(attempt.status, 'FAILED_RETRYABLE');
        assert.equal(attempt.attempt_budget_class, 'mechanical_no_provider');
        assert.equal(getForgeRequest(fixture.db, fixture.request.request_id)?.status, 'AUTHORIZED');
        assert.equal(countForgeProviderAttempts(fixture.db, fixture.request.request_id), 0);
        assert.equal(continuation.status, 'PENDING_REPAIR');
        assert.deepEqual(getForgeContinuationByAttempt(fixture.db, attempt.attempt_id), continuation);
        assert.throws(() => reserveForgeAttempt(fixture.db, {
            request_id: fixture.request.request_id,
            authorization_id: fixture.authorization.authorization_id,
            idempotency_key: 'mechanical-unvalidated',
            execution_receipt_id: 'mechanical-unvalidated-receipt',
            adapter_ref: fixture.request.adapter_ref!,
            retry_of_attempt_id: attempt.attempt_id,
            continuation_runtime_sha256: '3'.repeat(64),
        }), /forge_continuation_repair_validation_required/);
        bind(fixture, attempt.attempt_id, 'mechanical');

        const child = reserveForgeAttempt(fixture.db, {
            request_id: fixture.request.request_id,
            authorization_id: fixture.authorization.authorization_id,
            idempotency_key: 'mechanical-child',
            execution_receipt_id: 'mechanical-child-receipt',
            adapter_ref: fixture.request.adapter_ref!,
            retry_of_attempt_id: attempt.attempt_id,
            continuation_runtime_sha256: '3'.repeat(64),
        }).attempt;
        assert.equal(child.ordinal, 2);
        assert.equal(countForgeProviderAttempts(fixture.db, fixture.request.request_id), 1);
        assert.equal(getForgeContinuationByAttempt(fixture.db, attempt.attempt_id)?.status, 'RESUMED');
    });

    it('reconciles one exact terminal zero-provider row without rewriting lineage', () => {
        const fixture = setup('reconcile');
        finalizeForgeAttempt(fixture.db, {
            attempt_id: fixture.attempt.attempt_id,
            status: 'FAILED_FINAL',
            error_code: 'forge_hermes_target_material_too_large',
        });
        const beforeAuthorization = fixture.db.prepare(
            'SELECT * FROM hall_forge_authorizations WHERE request_id = ?',
        ).get(fixture.request.request_id);
        const continuation = record(fixture, true);
        assert.equal(continuation.reconciled_from_status, 'FAILED_FINAL');
        assert.equal(getForgeAttempt(fixture.db, fixture.attempt.attempt_id)?.status, 'FAILED_RETRYABLE');
        assert.equal(getForgeRequest(fixture.db, fixture.request.request_id)?.status, 'AUTHORIZED');
        assert.deepEqual(fixture.db.prepare(
            'SELECT * FROM hall_forge_authorizations WHERE request_id = ?',
        ).get(fixture.request.request_id), beforeAuthorization);
        assert.deepEqual(record(fixture, true), continuation);
    });

    it('rejects non-allowlisted failures and blocks the third unchanged failure', () => {
        const invalid = setup('invalid');
        assert.throws(() => finalizeForgePreProviderContinuation(invalid.db, {
            attempt_id: invalid.attempt.attempt_id,
            failure_code: 'forge_request_hash_mismatch',
            execution_trace_sha256: '1'.repeat(64),
            zero_provider_proof: zeroProof,
            continuation_authority_sha256: '2'.repeat(64),
            prior_runtime_sha256: '3'.repeat(64),
        }), /forge_preprovider_failure_not_recoverable/);

        const repeated = setup('repeated');
        record(repeated);
        bind(repeated, repeated.attempt.attempt_id, 'repeated-one');
        const child = reserveForgeAttempt(repeated.db, {
            request_id: repeated.request.request_id,
            authorization_id: repeated.authorization.authorization_id,
            idempotency_key: 'repeated-child',
            execution_receipt_id: 'repeated-child-receipt',
            adapter_ref: repeated.request.adapter_ref!,
            retry_of_attempt_id: repeated.attempt.attempt_id,
            continuation_runtime_sha256: '3'.repeat(64),
        }).attempt;
        const second = finalizeForgePreProviderContinuation(repeated.db, {
            attempt_id: child.attempt_id,
            failure_code: 'forge_hermes_target_material_too_large',
            execution_trace_sha256: '4'.repeat(64),
            zero_provider_proof: zeroProof,
            continuation_authority_sha256: '2'.repeat(64),
            prior_runtime_sha256: '3'.repeat(64),
        });
        assert.equal(second.status, 'PENDING_REPAIR');
        bind(repeated, child.attempt_id, 'repeated-two');
        const thirdAttempt = reserveForgeAttempt(repeated.db, {
            request_id: repeated.request.request_id,
            authorization_id: repeated.authorization.authorization_id,
            idempotency_key: 'repeated-third',
            execution_receipt_id: 'repeated-third-receipt',
            adapter_ref: repeated.request.adapter_ref!,
            retry_of_attempt_id: child.attempt_id,
            continuation_runtime_sha256: '3'.repeat(64),
        }).attempt;
        const third = finalizeForgePreProviderContinuation(repeated.db, {
            attempt_id: thirdAttempt.attempt_id,
            failure_code: 'forge_hermes_target_material_too_large',
            execution_trace_sha256: '5'.repeat(64),
            zero_provider_proof: zeroProof,
            continuation_authority_sha256: '2'.repeat(64),
            prior_runtime_sha256: '3'.repeat(64),
        });
        assert.equal(third.status, 'BLOCKED');
        assert.equal(third.block_reason, 'repeated_failure_no_progress');
        assert.equal(getForgeRequest(repeated.db, repeated.request.request_id)?.status, 'EXHAUSTED');
        assert.equal(countForgeProviderAttempts(repeated.db, repeated.request.request_id), 0);
    });

    it('blocks the tenth total mechanical cycle without consuming provider budget', () => {
        const fixture = setup('ten-cycles');
        let attempt = fixture.attempt;
        for (let cycle = 1; cycle <= 10; cycle += 1) {
            const runtime = String(cycle % 9 + 1).repeat(64);
            const continuation = finalizeForgePreProviderContinuation(fixture.db, {
                attempt_id: attempt.attempt_id,
                failure_code: 'forge_hermes_target_material_too_large',
                execution_trace_sha256: cycle.toString(16).padStart(64, '0'),
                zero_provider_proof: zeroProof,
                continuation_authority_sha256: '2'.repeat(64),
                prior_runtime_sha256: runtime,
            });
            if (cycle === 10) {
                assert.equal(continuation.status, 'BLOCKED');
                assert.equal(continuation.block_reason, 'mechanical_cycle_budget_exhausted');
                break;
            }
            bind(fixture, attempt.attempt_id, `ten-${cycle}`);
            attempt = reserveForgeAttempt(fixture.db, {
                request_id: fixture.request.request_id,
                authorization_id: fixture.authorization.authorization_id,
                idempotency_key: `ten-cycles-${cycle}`,
                execution_receipt_id: `ten-cycles-${cycle}-receipt`,
                adapter_ref: fixture.request.adapter_ref!,
                retry_of_attempt_id: attempt.attempt_id,
                continuation_runtime_sha256: runtime,
            }).attempt;
        }
        assert.equal(getForgeRequest(fixture.db, fixture.request.request_id)?.status, 'EXHAUSTED');
        assert.equal(countForgeProviderAttempts(fixture.db, fixture.request.request_id), 0);
    });
});
