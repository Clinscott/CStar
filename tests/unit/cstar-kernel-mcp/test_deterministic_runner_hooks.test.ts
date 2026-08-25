import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    ACTUAL_IDENTITY_UNREPORTED,
    CANONICAL_CONTRACT_SHA256,
    CANONICAL_MANIFEST_SHA256,
    EFFECT_ORDER,
    FORGE_POLICY,
    LIFECYCLE_PHASES,
    TRANSPORT_EFFECTS,
    applyTransportResult,
    assertNegativeProofs,
    assertRunnerStateSchema,
    canonicalSerialize,
    createRunnerRequest,
    createRunnerState,
    deriveEffectIdentity,
    hashRunnerRequest,
    queueNextEffect,
    recoverUnknown,
    recordValidation,
    rejectForbiddenOperation,
    markTerminal,
    sha256Utf8,
} from '../../../src/tools/cstar-kernel-mcp/contracts/deterministic_runner_hooks.js';
import type {
    EffectIntent,
    RunnerRequest,
    RunnerState,
    TransportResult,
} from '../../../src/tools/cstar-kernel-mcp/contracts/deterministic_runner_hooks.js';

const RESPONSE_HASH = sha256Utf8('offline-response');

function request(overrides: Partial<RunnerRequest> = {}): RunnerRequest {
    return createRunnerRequest({
        task_id: 'task:cso-d004-s01',
        root_task_id: 'task:cso-d004-s01',
        scope: 'brain:CStar',
        requested_model_selector: 'gpt-5.6-luna',
        requested_reasoning: 'max',
        ...overrides,
    });
}

function ack(intent: EffectIntent, label: string): TransportResult {
    return {
        effect_id: intent.effect_id,
        idempotency_key: intent.idempotency_key,
        status: 'ACK',
        ack_id: 'ack:' + label,
        observed_revision: null,
        boundary: null,
        failure_code: null,
        response_sha256: RESPONSE_HASH,
    };
}

function runSixEffects(initial: RunnerState): RunnerState {
    let state = initial;
    for (const order of EFFECT_ORDER) {
        const queued = queueNextEffect(state, state.revision, { sequence: order.sequence, fixture: 'offline' });
        assert.equal(queued.outcome, 'OK', JSON.stringify(queued));
        assert.ok(queued.intent);
        const applied = applyTransportResult(state = queued.state, state.revision, ack(queued.intent!, String(order.sequence)));
        assert.equal(applied.outcome, 'OK', JSON.stringify(applied));
        state = applied.state;
    }
    return state;
}

describe('S01 deterministic lifecycle runner hooks', () => {
    it('uses explicit field order and UTF-8 bytes for canonical hashes', () => {
        const original = request();
        const scrambled = Object.fromEntries(Object.entries(original).reverse()) as RunnerRequest;
        assert.equal(canonicalSerialize('request', original), canonicalSerialize('request', scrambled));
        assert.equal(hashRunnerRequest(original), hashRunnerRequest(scrambled));
        assert.match(canonicalSerialize('request', original), /^\{"contract_id":/);
        const expected = createHash('sha256').update(Buffer.from('café', 'utf8')).digest('hex');
        assert.equal(sha256Utf8('café'), expected);
        assert.equal(Buffer.from('é', 'utf8').length, 2);
    });

    it('enforces expected-revision CAS without mutating on a stale write', () => {
        const initial = createRunnerState(request());
        const queued = queueNextEffect(initial, 0, { fixture: 'cas' });
        assert.equal(queued.outcome, 'OK');
        const stale = queueNextEffect(queued.state, 0, { fixture: 'cas' });
        assert.equal(stale.outcome, 'REJECTED');
        assert.equal(stale.failure?.code, 'CAS_MISMATCH');
        assert.equal(stale.state.revision, queued.state.revision);
        assert.equal(stale.metrics_delta.cas_mismatches, 1);
    });

    it('derives stable effect and idempotency identities and rejects result conflicts', () => {
        const identityA = deriveEffectIdentity({
            task_id: 'task:stable',
            sequence: 0,
            effect: 'TASK_CREATE',
            payload: { z: 1, a: 'same' },
        });
        const identityB = deriveEffectIdentity({
            task_id: 'task:stable',
            sequence: 0,
            effect: 'TASK_CREATE',
            payload: { a: 'same', z: 1 },
        });
        assert.deepEqual(identityA, identityB);

        const initial = createRunnerState(request({ task_id: 'task:idempotency' }));
        const queued = queueNextEffect(initial, 0, { fixture: 'idempotency' });
        assert.ok(queued.intent);
        const applied = applyTransportResult(queued.state, queued.state.revision, ack(queued.intent!, 'create'));
        assert.equal(applied.outcome, 'OK');
        const replay = applyTransportResult(applied.state, 0, ack(queued.intent!, 'create'));
        assert.equal(replay.outcome, 'IDEMPOTENT_REPLAY');
        const conflict = applyTransportResult(applied.state, applied.state.revision, {
            ...ack(queued.intent!, 'different'),
        });
        assert.equal(conflict.outcome, 'REJECTED');
        assert.equal(conflict.failure?.code, 'IDEMPOTENCY_CONFLICT');
    });

    it('walks the closed six-effect order and terminal validation phases', () => {
        assert.deepEqual(EFFECT_ORDER.map((entry) => entry.effect), TRANSPORT_EFFECTS);
        assert.deepEqual(new Set(EFFECT_ORDER.flatMap((entry) => [entry.from_phase, entry.pending_phase, entry.ack_phase])).size > 0, true);
        const afterEffects = runSixEffects(createRunnerState(request({ task_id: 'task:closed' })));
        assert.equal(afterEffects.phase, 'READ');
        assert.equal(afterEffects.next_effect_sequence, 6);
        const terminal = markTerminal(afterEffects, afterEffects.revision, 'offline fixture complete');
        assert.equal(terminal.outcome, 'OK');
        const validated = recordValidation(terminal.state, terminal.state.revision, {
            validator_id: 'validator:independent-fixture',
            validator_kind: 'independent',
            result: 'PASS',
            evidence_sha256: sha256Utf8('offline-evidence'),
        });
        assert.equal(validated.outcome, 'OK');
        assert.equal(validated.state.phase, 'VALIDATED');
        assert.ok(LIFECYCLE_PHASES.includes(validated.state.phase));
        assertRunnerStateSchema(validated.state);
    });

    it('freezes uncertain post-effect state as UNKNOWN and requires recovery without retry', () => {
        const initial = createRunnerState(request({ task_id: 'task:unknown' }));
        const queued = queueNextEffect(initial, 0, { fixture: 'crash' });
        assert.ok(queued.intent);
        const unknown = applyTransportResult(queued.state, queued.state.revision, {
            effect_id: queued.intent!.effect_id,
            idempotency_key: queued.intent!.idempotency_key,
            status: 'UNKNOWN',
            ack_id: null,
            observed_revision: null,
            boundary: 'after_transport_before_ack_persist',
            failure_code: 'UNKNOWN_POST_EFFECT',
            response_sha256: null,
        });
        assert.equal(unknown.outcome, 'UNKNOWN');
        assert.equal(unknown.failure?.code, 'UNKNOWN_POST_EFFECT');
        assert.equal(unknown.state.phase, 'UNKNOWN');
        assert.equal(unknown.state.recovery?.boundary, 'after_transport_before_ack_persist');
        const retry = queueNextEffect(unknown.state, unknown.state.revision, null);
        assert.equal(retry.outcome, 'REJECTED');
        assert.equal(retry.failure?.code, 'RECOVERY_REQUIRED');
        assert.equal(retry.state.metrics.retry_attempts, 0);
        const recovered = recoverUnknown(unknown.state, unknown.state.revision, {
            observed_status: 'UNKNOWN',
            recovery_action: 'HOLD',
            required_operator_decision: 'RECONCILE',
        });
        assert.equal(recovered.outcome, 'OK');
        assert.equal(recovered.state.phase, 'RECOVERY');
        const stillBlocked = queueNextEffect(recovered.state, recovered.state.revision, null);
        assert.equal(stillBlocked.failure?.code, 'RECOVERY_REQUIRED');
    });

    it('keeps requested selector, requested reasoning, and actual identity separate', () => {
        const unreported = request();
        const attestation = sha256Utf8('host-attestation');
        const attested = request({
            requested_model_selector: 'different-requested-selector',
            actual_identity: 'host-attested-identity',
            actual_identity_attestation_sha256: attestation,
        });
        assert.equal(unreported.actual_identity, ACTUAL_IDENTITY_UNREPORTED);
        assert.equal(unreported.actual_identity_attestation_sha256, null);
        assert.equal(unreported.requested_model_selector, 'gpt-5.6-luna');
        assert.equal(unreported.requested_reasoning, 'max');
        assert.equal(attested.actual_identity, 'host-attested-identity');
        assert.equal(attested.actual_identity_attestation_sha256, attestation);
        const first = queueNextEffect(createRunnerState(unreported), 0, { fixed: true });
        const second = queueNextEffect(createRunnerState(attested), 0, { fixed: true });
        assert.equal(first.intent?.effect_id, second.intent?.effect_id);
        assert.equal(first.state.phase, second.state.phase);
        assert.notEqual(hashRunnerRequest(unreported), hashRunnerRequest(attested));
    });

    it('keeps retry zero and proves forbidden authority paths are closed', () => {
        const state = createRunnerState(request({ task_id: 'task:negative' }));
        assert.equal(state.retry_budget, 0);
        assert.equal(state.retry_count, 0);
        assert.equal(FORGE_POLICY.status, 'TOMBSTONED_PERMANENT');
        assert.equal(FORGE_POLICY.reachable, false);
        assert.equal(rejectForbiddenOperation('FORGE_REACHABILITY').code, 'FORGE_REACHABILITY_FORBIDDEN');
        assert.equal(rejectForbiddenOperation('MODEL_SELECTED_LIFECYCLE').code, 'MODEL_SELECTED_LIFECYCLE_FORBIDDEN');
        assert.equal(rejectForbiddenOperation('TRANSCRIPT_AUTHORITY').code, 'TRANSCRIPT_AUTHORITY_FORBIDDEN');
        assert.equal(rejectForbiddenOperation('POLLING').code, 'POLLING_FORBIDDEN');
        assert.equal(rejectForbiddenOperation('SILENT_RETRY').code, 'SILENT_RETRY_FORBIDDEN');
        assert.equal(rejectForbiddenOperation('DUPLICATE_EXTERNAL_EFFECT').code, 'DUPLICATE_EXTERNAL_EFFECT_FORBIDDEN');
        assertNegativeProofs(state.metrics);
        assert.equal(CANONICAL_MANIFEST_SHA256.length, 64);
        assert.equal(CANONICAL_CONTRACT_SHA256.length, 64);
    });

    it('exposes measurable deterministic counters and checkpoint bindings', () => {
        const final = runSixEffects(createRunnerState(request({ task_id: 'task:counters' })));
        assert.equal(final.metrics.effects_planned, 6);
        assert.equal(final.metrics.effects_acknowledged, 6);
        assert.equal(final.metrics.effects_unknown, 0);
        assert.equal(final.metrics.retry_attempts, 0);
        assert.equal(final.metrics.poll_attempts, 0);
        assert.equal(final.metrics.external_effects_executed, 0);
        assert.equal(final.metrics.duplicate_external_effects, 0);
        assert.equal(final.snapshot.state_sha256, final.checkpoint.snapshot_sha256);
        assert.equal(final.snapshot.journal_sha256, final.checkpoint.journal_sha256);
        assertNegativeProofs(final.metrics);
    });
});
