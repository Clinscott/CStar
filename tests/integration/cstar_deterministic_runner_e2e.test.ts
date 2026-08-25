import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    EFFECT_ORDER,
    applyTransportResult,
    assertNegativeProofs,
    createRunnerRequest,
    createRunnerState,
    markTerminal,
    recordValidation,
    queueNextEffect,
    sha256Utf8,
} from '../../src/tools/cstar-kernel-mcp/contracts/deterministic_runner_hooks.js';

function offlineRun() {
    let state = createRunnerState(createRunnerRequest({
        task_id: 'task:cso-d004-s01:e2e',
        root_task_id: 'task:cso-d004-s01:e2e',
        scope: 'brain:CStar',
        requested_model_selector: 'gpt-5.6-luna',
        requested_reasoning: 'max',
    }));
    for (const order of EFFECT_ORDER) {
        const queued = queueNextEffect(state, state.revision, {
            effect: order.effect,
            sequence: order.sequence,
            fixture: 'offline-deterministic',
        });
        assert.equal(queued.outcome, 'OK');
        const intent = queued.intent!;
        state = queued.state;
        const applied = applyTransportResult(state, state.revision, {
            effect_id: intent.effect_id,
            idempotency_key: intent.idempotency_key,
            status: 'ACK',
            ack_id: 'offline-ack-' + order.sequence,
            observed_revision: null,
            boundary: null,
            failure_code: null,
            response_sha256: sha256Utf8('offline:' + order.effect),
        });
        assert.equal(applied.outcome, 'OK');
        state = applied.state;
    }
    state = markTerminal(state, state.revision, 'offline e2e complete').state;
    state = recordValidation(state, state.revision, {
        validator_id: 'validator:offline-e2e',
        validator_kind: 'independent',
        result: 'PASS',
        evidence_sha256: sha256Utf8(state.snapshot.state_sha256),
    }).state;
    return state;
}

describe('S01 deterministic runner offline integration', () => {
    it('replays the six-effect lifecycle deterministically without providers or network', () => {
        const first = offlineRun();
        const second = offlineRun();
        assert.equal(first.phase, 'VALIDATED');
        assert.equal(second.phase, 'VALIDATED');
        assert.equal(first.snapshot.state_sha256, second.snapshot.state_sha256);
        assert.equal(first.checkpoint.checkpoint_id, second.checkpoint.checkpoint_id);
        assert.deepEqual(first.metrics, second.metrics);
        assert.equal(first.metrics.external_effects_executed, 0);
        assert.equal(first.metrics.forge_reachability, 0);
        assert.equal(first.metrics.model_selected_lifecycle, 0);
        assert.equal(first.metrics.transcript_authority, 0);
        assert.equal(first.metrics.poll_attempts, 0);
        assert.equal(first.metrics.retry_attempts, 0);
        assert.equal(first.metrics.duplicate_external_effects, 0);
        assertNegativeProofs(first.metrics);
    });
});
