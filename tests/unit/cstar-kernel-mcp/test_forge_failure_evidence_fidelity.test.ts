import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { projectForgeFailureEvidence } from
    '../../../src/tools/cstar-kernel-mcp/tools/forge_failure_evidence.js';

const ROLES = ['specifier', 'coder', 'cleaner', 'architect', 'hardener', 'qa'];
const PLAN_SHA = '61e9b28d65ad80495bce567307dc8e577a5335d6897a46591efdd54b76b62d52';

function roleReceipt(index: number) {
    return {
        role: ROLES[index], phase: `${index + 1}/6`,
        input_handoff_sha256: index === 0 ? '0'.repeat(64) : `${index}`.repeat(64),
        specification_handoff_sha256: index === 0 ? '0'.repeat(64) : '1'.repeat(64),
        output_handoff_sha256: `${index + 1}`.repeat(64),
        input_tokens: 10, output_tokens: 20,
    };
}

function providerReceipt(index: number, finalState = 'response_body_complete') {
    const invalid = finalState === 'invalid_or_missing';
    const synthetic = finalState.startsWith('synthetic_');
    return {
        role: ROLES[index], phase: `${index + 1}/6`, final_state: finalState,
        binding_sha256: `${index + 1}`.repeat(64),
        journal_sha256: invalid ? null : `${index + 2}`.repeat(64),
        journal_valid: !invalid, synthetic,
    };
}

function partialEnvelope() {
    return {
        status: 'degraded', forge_topology: 'bounded-six-role-manifest-v1',
        role_plan_sha256: PLAN_SHA,
        role_receipts: [0, 1, 2].map(roleReceipt),
        provider_request_receipts: [
            providerReceipt(0), providerReceipt(1), providerReceipt(2),
            providerReceipt(3, 'dispatch_attempted'),
        ],
        provider_requests_started: 4, provider_requests_completed: 3,
        provider_requests_ambiguous: 1, input_tokens: 30, output_tokens: 60,
        live_spend: false, live_spend_unknown: false,
        known_spend_observed: false,
    };
}

function successEnvelope() {
    return {
        status: 'ok', forge_topology: 'bounded-six-role-manifest-v1',
        role_plan_sha256: PLAN_SHA,
        role_receipts: ROLES.map((_role, index) => roleReceipt(index)),
        provider_request_receipts: ROLES.map((_role, index) => providerReceipt(index)),
        provider_requests_started: 6, provider_requests_completed: 6,
        provider_requests_ambiguous: 0, input_tokens: 60, output_tokens: 120,
        live_spend: true, live_spend_unknown: false,
        known_spend_observed: true,
    };
}

describe('CStar Forge conservative failure-evidence projection', () => {
    it('cannot let worker booleans mask known spend followed by ambiguity', () => {
        const projected = projectForgeFailureEvidence(partialEnvelope());
        assert.equal(projected.provider_evidence_valid, true);
        assert.equal(projected.known_spend_observed, true);
        assert.equal(projected.live_spend, null);
        assert.equal(projected.live_spend_unknown, true);
        assert.equal(projected.provider_requests_completed, 3);
        assert.equal(projected.provider_requests_ambiguous, 1);
        assert.deepEqual(projected.role_receipts?.map((item) => item.role), ROLES.slice(0, 3));
        assert.equal(projected.input_tokens, 30);
        assert.equal(projected.output_tokens, 60);
    });

    it('accepts success only with six completed exact receipts and role evidence', () => {
        const projected = projectForgeFailureEvidence(successEnvelope());
        assert.equal(projected.provider_evidence_valid, true);
        assert.equal(projected.success_evidence_valid, true);
        assert.equal(projected.live_spend, true);
        assert.equal(projected.live_spend_unknown, false);
        assert.equal(projected.provider_request_receipts.length, 6);

        const short = successEnvelope();
        short.provider_request_receipts = short.provider_request_receipts.slice(0, 5);
        short.provider_requests_started = 5;
        short.provider_requests_completed = 5;
        assert.equal(projectForgeFailureEvidence(short).success_evidence_valid, false);
    });

    it('preserves a valid completed prefix but fails closed on a malformed later receipt', () => {
        const canary = 'secret-provider-body-and-path-canary';
        const raw: Record<string, unknown> = partialEnvelope();
        raw.provider_request_receipts = [
            providerReceipt(0), providerReceipt(1), providerReceipt(2),
            { stdout: canary, provider_headers: canary, path: canary },
        ];
        raw.stdout = canary; raw.stderr = canary; raw.pid = 12345;
        const projected = projectForgeFailureEvidence(raw);
        const serialized = JSON.stringify(projected);
        assert.equal(projected.provider_evidence_valid, false);
        assert.equal(projected.provider_requests_completed, 3);
        assert.equal(projected.known_spend_observed, true);
        assert.equal(projected.live_spend, null);
        assert.equal(projected.live_spend_unknown, true);
        assert.equal(projected.provider_request_receipts.length, 3);
        assert.doesNotMatch(serialized, new RegExp(canary));
        assert.equal(Object.hasOwn(projected, 'pid'), false);
    });

    it('treats a completed request contradicted by no-spend booleans as unknown', () => {
        const raw = successEnvelope();
        raw.live_spend = false;
        raw.known_spend_observed = false;
        const projected = projectForgeFailureEvidence(raw);
        assert.equal(projected.known_spend_observed, true);
        assert.equal(projected.live_spend, null);
        assert.equal(projected.live_spend_unknown, true);
        assert.equal(projected.success_evidence_valid, false);
    });

    it('accepts exact zero-dispatch evidence as no-spend', () => {
        const projected = projectForgeFailureEvidence({
            status: 'degraded', role_receipts: [], provider_request_receipts: [],
            provider_requests_started: 0, provider_requests_completed: 0,
            provider_requests_ambiguous: 0, input_tokens: 0, output_tokens: 0,
            live_spend: false, live_spend_unknown: false,
            known_spend_observed: false,
        });
        assert.equal(projected.provider_evidence_valid, true);
        assert.equal(projected.live_spend, false);
        assert.equal(projected.live_spend_unknown, false);
        assert.equal(projected.known_spend_observed, false);
    });

    it('preserves provider-acknowledged spend when headers arrive before a failed body', () => {
        const raw = partialEnvelope();
        raw.role_receipts = [];
        raw.provider_request_receipts = [providerReceipt(0, 'response_headers_received')];
        raw.provider_requests_started = 1;
        raw.provider_requests_completed = 0;
        raw.provider_requests_ambiguous = 1;
        raw.input_tokens = 0;
        raw.output_tokens = 0;
        raw.live_spend = null;
        raw.live_spend_unknown = true;
        raw.known_spend_observed = true;
        const projected = projectForgeFailureEvidence(raw);
        assert.equal(projected.provider_evidence_valid, true);
        assert.equal(projected.known_spend_observed, true);
        assert.equal(projected.live_spend, null);
        assert.equal(projected.live_spend_unknown, true);
    });

    it('recognizes only ENOENT and E2BIG as proven pre-spawn no-spend', () => {
        for (const code of ['ENOENT', 'E2BIG']) {
            const projected = projectForgeFailureEvidence(null, code);
            assert.equal(projected.pre_spawn_no_spend_proven, true);
            assert.equal(projected.live_spend, false);
            assert.equal(projected.live_spend_unknown, false);
        }
        const uncertain = projectForgeFailureEvidence(null, 'ETIMEDOUT');
        assert.equal(uncertain.pre_spawn_no_spend_proven, false);
        assert.equal(uncertain.live_spend, null);
        assert.equal(uncertain.live_spend_unknown, true);
    });

    it('never infers provider state from a PID or mismatched counts', () => {
        const raw: Record<string, unknown> = {
            status: 'degraded', pid: 8123,
            role_receipts: [], provider_requests_started: 0,
            provider_requests_completed: 0, provider_requests_ambiguous: 0,
            input_tokens: 0, output_tokens: 0,
            live_spend: false, live_spend_unknown: false,
        };
        const noReceiptEvidence = projectForgeFailureEvidence(raw);
        assert.equal(noReceiptEvidence.provider_evidence_valid, false);
        assert.equal(noReceiptEvidence.live_spend_unknown, true);

        const mismatch = partialEnvelope();
        mismatch.provider_requests_ambiguous = 0;
        const projected = projectForgeFailureEvidence(mismatch);
        assert.equal(projected.provider_evidence_valid, false);
        assert.equal(projected.provider_requests_completed, 3);
        assert.equal(projected.provider_requests_ambiguous, 1);
        assert.equal(projected.live_spend_unknown, true);
    });

    it('rejects receipt state tuples that contradict journal validity', () => {
        const raw = successEnvelope();
        raw.provider_request_receipts[3] = {
            ...raw.provider_request_receipts[3], journal_valid: false,
        };
        const projected = projectForgeFailureEvidence(raw);
        assert.equal(projected.provider_evidence_valid, false);
        assert.equal(projected.provider_requests_completed, 3);
        assert.equal(projected.live_spend_unknown, true);
        assert.equal(projected.success_evidence_valid, false);
    });
});
