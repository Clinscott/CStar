import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    ACTUAL_IDENTITY_UNREPORTED, CANONICAL_MANIFEST_SHA256, EFFECT_ORDER, PLAN_VERSION,
    assertNegativeMetrics, createTerminalPacket, hashGeneric, sha256Utf8,
} from '../../src/tools/cstar-kernel-mcp/contracts/task_terminal_observation.js';
import {
    assertAdapterMetrics, createTaskTerminalObservationAdapter, rehydrateTaskTerminalObservationAdapter,
    type AdapterContext, type EffectIntent, type NativeReadResponse, type TransportResult,
} from '../../src/tools/cstar-kernel-mcp/tools/task_terminal_observation_adapter.js';

type RunnerState = { task_id: string; root_task_id: string; scope: string; requested_model_selector: string; requested_reasoning: string; revision: number; next_effect_sequence: number; phase: string };
const LOCAL_EFFECTS = ['TASK_CREATE', 'TASK_RESUME', 'TASK_FORK', 'TASK_SEND', 'TASK_WAIT', 'TASK_READ'] as const;
const LOCAL_PHASES = ['PLANNED', 'CREATED', 'RESUMED', 'FORKED', 'SENT', 'WAITED', 'READ'] as const;
function createRunnerRequest(input: Omit<RunnerState, 'revision' | 'next_effect_sequence' | 'phase'>): Omit<RunnerState, 'revision' | 'next_effect_sequence' | 'phase'> { return input; }
function createRunnerState(request: Omit<RunnerState, 'revision' | 'next_effect_sequence' | 'phase'>): RunnerState { return { ...request, revision: 0, next_effect_sequence: 0, phase: 'PLANNED' }; }
function queueNextEffect(state: RunnerState, expectedRevision: number, payload: unknown): { outcome: 'OK'; state: RunnerState; intent: EffectIntent } {
    assert.equal(expectedRevision, state.revision); const sequence = state.next_effect_sequence; const effect = LOCAL_EFFECTS[sequence];
    const intent: EffectIntent = { effect_id: `effect:${state.task_id}:${sequence}`, idempotency_key: `idem:${state.task_id}:${sequence}`, sequence, effect, payload_sha256: sha256Utf8(JSON.stringify(payload)), expected_revision: state.revision, retry_count: 0 };
    return { outcome: 'OK', state: { ...state, revision: state.revision + 1, phase: `${effect}_PENDING` }, intent };
}
function applyTransportResult(state: RunnerState, expectedRevision: number, result: TransportResult): { outcome: 'OK'; state: RunnerState } {
    assert.equal(expectedRevision, state.revision); assert.equal(result.status, 'ACK');
    return { outcome: 'OK', state: { ...state, revision: state.revision + 1, next_effect_sequence: state.next_effect_sequence + 1, phase: LOCAL_PHASES[state.next_effect_sequence + 1] ?? 'READ' } };
}

function reducerAck(intent: EffectIntent, label: string): TransportResult {
    return { effect_id: intent.effect_id, idempotency_key: intent.idempotency_key, status: 'ACK', ack_id: 'offline:' + label, observed_revision: null, boundary: null, failure_code: null, response_sha256: sha256Utf8(label) };
}
function fixture(taskId = 'task:terminal-observation-e2e') {
    let prefix = createRunnerState(createRunnerRequest({ task_id: taskId, root_task_id: taskId, scope: 'brain:CStar', requested_model_selector: 'gpt-5.6-luna', requested_reasoning: 'max' }));
    for (let sequence = 0; sequence < 3; sequence += 1) {
        const queued = queueNextEffect(prefix, prefix.revision, { sequence, fixture: 'prefix' });
        prefix = applyTransportResult(queued.state, queued.state.revision, reducerAck(queued.intent!, 'prefix-' + sequence)).state;
    }
    const sendQueued = queueNextEffect(prefix, prefix.revision, { sequence: 3, fixture: 'send' });
    const afterSend = applyTransportResult(sendQueued.state, sendQueued.state.revision, reducerAck(sendQueued.intent!, 'send')).state;
    const waitQueued = queueNextEffect(afterSend, afterSend.revision, { sequence: 4, fixture: 'wait' });
    const afterWait = applyTransportResult(waitQueued.state, waitQueued.state.revision, reducerAck(waitQueued.intent!, 'wait')).state;
    const readQueued = queueNextEffect(afterWait, afterWait.revision, { sequence: 5, fixture: 'read' });
    const context: AdapterContext = {
        task_id: taskId, root_task_id: taskId, request_id: 'request:' + taskId, target_thread_id: 'thread:' + taskId,
        send_intent: sendQueued.intent!, wait_intent: waitQueued.intent!, read_intent: readQueued.intent!, message: 'e2e terminal observation',
        canonical_cwd_sha256: sha256Utf8('/cstar'), requested_model_selector: 'gpt-5.6-luna', requested_reasoning: 'max',
        actual_identity: ACTUAL_IDENTITY_UNREPORTED, actual_identity_attestation_sha256: null, host_id: 'unreported', send_requested_wall_time: 1,
    };
    return { prefix, sendQueued, waitQueued, readQueued, context, adapter: createTaskTerminalObservationAdapter(context) };
}
function sendResponse(context: AdapterContext) { return { returned_thread_id: context.target_thread_id, returned_turn_id: 'turn:e2e', send_ack_wall_time: 2, send_ack_monotonic_ms: 100, host_id: 'unreported' }; }
function terminalProjection(fixture: ReturnType<typeof fixture>) {
    const schedule = fixture.adapter.schedule!;
    return { task_id: fixture.context.task_id, root_task_id: fixture.context.root_task_id, effect_id: fixture.context.read_intent.effect_id, schedule_id: schedule.schedule_id, target_thread_id: fixture.context.target_thread_id, originating_turn_id: schedule.returned_turn_id } as const;
}
function terminal(fixture: ReturnType<typeof fixture>): NativeReadResponse {
    const schedule = fixture.adapter.schedule!;
    const packet = createTerminalPacket({
        schedule_id: schedule.schedule_id, task_id: fixture.context.task_id, root_task_id: fixture.context.root_task_id,
        effect_id: fixture.context.read_intent.effect_id, target_thread_id: fixture.context.target_thread_id, originating_turn_id: schedule.returned_turn_id,
        requested_model_selector: fixture.context.requested_model_selector, requested_reasoning: fixture.context.requested_reasoning,
        actual_identity: fixture.context.actual_identity, actual_identity_attestation_sha256: fixture.context.actual_identity_attestation_sha256,
        outcome: 'DELIVERED_UNVERIFIED', terminal_state: 'TERMINAL', terminal_result_projection: terminalProjection(fixture),
        artifacts_sha256: sha256Utf8('e2e-artifacts'), tests_sha256: sha256Utf8('e2e-tests'), terminal_manifest_sha256: CANONICAL_MANIFEST_SHA256, protected_effects: 0,
    });
    return { returned_thread_id: fixture.context.target_thread_id, returned_turn_id: schedule.returned_turn_id, thread_status: 'TERMINAL', terminal_projection_status: 'STRUCTURED', terminal_result_projection: terminalProjection(fixture), terminal_packet: packet, host_cursor: null, host_cursor_status: 'unavailable', transcript_included: false };
}
function sendAndWait(fixture: ReturnType<typeof fixture>) {
    const calls = { send: 0, read: 0 };
    const host = { send: () => { calls.send += 1; return sendResponse(fixture.context); }, read: () => { calls.read += 1; return terminal(fixture); } };
    const sent = fixture.adapter.send(host); assert.equal(sent.status, 'ACK');
    const waited = fixture.adapter.reserveWaitSchedule(); assert.equal(waited.status, 'ACK');
    return { host, calls, sent, waited };
}
function replayFingerprint(seed: number): string {
    const f = fixture('task:terminal-observation-replay:' + seed); let reads = 0;
    const host = {
        send: () => sendResponse(f.context),
        read: () => {
            reads += 1;
            return reads === 1
                ? { returned_thread_id: f.context.target_thread_id, returned_turn_id: 'turn:e2e', thread_status: 'NONTERMINAL' as const, terminal_projection_status: 'NONTERMINAL' as const, host_cursor: 'cursor:' + seed, host_cursor_status: 'returned' as const, transcript_included: false }
                : terminal(f);
        },
    };
    const sent = f.adapter.send(host); const waited = f.adapter.reserveWaitSchedule();
    const first = f.adapter.read(host, f.adapter.schedule!.read_1_due_ms); const second = f.adapter.read(host, f.adapter.schedule!.read_2_due_ms);
    const sendApplied = applyTransportResult(f.sendQueued.state, f.sendQueued.state.revision, sent.transport_result!);
    const waitApplied = applyTransportResult(f.waitQueued.state, f.waitQueued.state.revision, waited.transport_result!);
    const readApplied = applyTransportResult(f.readQueued.state, f.readQueued.state.revision, second.transport_result!);
    return hashGeneric({
        canonical_input: { seed, task_id: f.context.task_id, requested_model_selector: f.context.requested_model_selector, requested_reasoning: f.context.requested_reasoning },
        schedule: f.adapter.schedule, cursor: f.adapter.cursor, observations: f.adapter.observations, terminal_packet: f.adapter.terminal_packet,
        reducer_result: { send: sendApplied.state, wait: waitApplied.state, read: readApplied.state },
        checkpoint: { phase: f.adapter.phase, reads, first_status: first.status, second_status: second.status, direct_reads: f.adapter.metrics.direct_read_calls },
    });
}

describe('CSO-D004/D003 terminal observation adapter e2e', () => {
    it('handles an absent wait handler with a valid first terminal read', () => {
        const f = fixture(); const run = sendAndWait(f); const result = f.adapter.read(run.host, f.adapter.schedule!.read_1_due_ms);
        assert.equal(result.status, 'ACK'); assert.equal(result.transport_result?.status, 'ACK'); assert.equal(f.adapter.phase, 'DELIVERED_UNVERIFIED');
        assert.equal(run.calls.send, 1); assert.equal(run.calls.read, 1); assert.equal(f.adapter.metrics.native_wait_calls, 0); assert.equal(f.adapter.metrics.interval_poll_calls, 0);
        assertAdapterMetrics(f.adapter.metrics); assert.equal(f.adapter.metrics.send_ack_count, 1); assert.equal(f.adapter.metrics.terminal_packet_count, 1); assert.equal(f.adapter.metrics.unknown_count, 0);
        const sendApplied = applyTransportResult(f.sendQueued.state, f.sendQueued.state.revision, run.sent.transport_result!);
        const waitApplied = applyTransportResult(f.waitQueued.state, f.waitQueued.state.revision, run.waited.transport_result!);
        const readApplied = applyTransportResult(f.readQueued.state, f.readQueued.state.revision, result.transport_result!);
        assert.equal(sendApplied.state.phase, 'SENT'); assert.equal(waitApplied.state.phase, 'WAITED'); assert.equal(readApplied.state.phase, 'READ');
    });
    it('handles a nonterminal first read and valid second terminal read', () => {
        const f = fixture(); const calls = { send: 0, read: 0 }; let reads = 0;
        const host = { send: () => { calls.send += 1; return sendResponse(f.context); }, read: () => { calls.read += 1; reads += 1; return reads === 1 ? { returned_thread_id: f.context.target_thread_id, returned_turn_id: 'turn:e2e', thread_status: 'NONTERMINAL' as const, terminal_projection_status: 'NONTERMINAL' as const, host_cursor: null, host_cursor_status: 'unavailable' as const, transcript_included: false } : terminal(f); } };
        assert.equal(f.adapter.send(host).status, 'ACK'); assert.equal(f.adapter.reserveWaitSchedule().status, 'ACK');
        assert.equal(f.adapter.read(host, f.adapter.schedule!.read_1_due_ms).status, 'OBSERVATION_PENDING');
        const second = f.adapter.read(host, f.adapter.schedule!.read_2_due_ms); assert.equal(second.status, 'ACK'); assert.equal(calls.send, 1); assert.equal(calls.read, 2); assert.equal(f.adapter.metrics.direct_read_calls, 2);
    });
    it('never invokes the unavailable native wait handler or a notification substitute', () => {
        const f = fixture(); let waitPropertyRead = false;
        const host = { send: () => sendResponse(f.context), read: () => terminal(f) };
        assert.equal('wait' in host, false); assert.equal(f.adapter.send(host).status, 'ACK');
        const schedule = f.adapter.reserveWaitSchedule(); assert.equal(schedule.status, 'ACK'); assert.equal(waitPropertyRead, false);
        assert.equal(f.adapter.metrics.native_wait_calls, 0); assert.equal(f.adapter.metrics.interval_poll_calls, 0);
    });
    it('freezes UNKNOWN when the second observation is inconclusive', () => {
        const f = fixture(); const host = { send: () => sendResponse(f.context), read: (request: { observation_index: number }) => request.observation_index === 1 ? { returned_thread_id: f.context.target_thread_id, returned_turn_id: 'turn:e2e', thread_status: 'NONTERMINAL' as const, terminal_projection_status: 'NONTERMINAL' as const, host_cursor: null, host_cursor_status: 'unavailable' as const, transcript_included: false } : { returned_thread_id: f.context.target_thread_id, returned_turn_id: 'turn:e2e', thread_status: 'UNAVAILABLE' as const, terminal_projection_status: 'UNAVAILABLE' as const, host_cursor: null, host_cursor_status: 'unavailable' as const, transcript_included: false } };
        f.adapter.send(host); f.adapter.reserveWaitSchedule(); assert.equal(f.adapter.read(host, f.adapter.schedule!.read_1_due_ms).status, 'OBSERVATION_PENDING');
        const second = f.adapter.read(host, f.adapter.schedule!.read_2_due_ms); assert.equal(second.status, 'UNKNOWN'); assert.equal(second.failure?.subcode, 'TERMINAL_OBSERVATION_EXHAUSTED');
        assert.equal(f.adapter.metrics.unknown_count, 1); assert.equal(f.adapter.metrics.direct_read_calls, 2); assert.equal(f.adapter.read(host, f.adapter.schedule!.read_2_due_ms).status, 'FAILURE');
    });
    it('rehydrates schedule and cursor state without executing an effect or read', () => {
        const f = fixture(); let reads = 0; const host = { send: () => sendResponse(f.context), read: () => { reads += 1; return { returned_thread_id: f.context.target_thread_id, returned_turn_id: 'turn:e2e', thread_status: 'NONTERMINAL' as const, terminal_projection_status: 'NONTERMINAL' as const, host_cursor: null, host_cursor_status: 'unavailable' as const, transcript_included: false }; } };
        f.adapter.send(host); f.adapter.reserveWaitSchedule(); f.adapter.read(host, f.adapter.schedule!.read_1_due_ms);
        const snapshot = f.adapter.snapshot(); const restored = rehydrateTaskTerminalObservationAdapter(snapshot);
        assert.equal(restored.snapshotSha256(), f.adapter.snapshotSha256()); assert.equal(restored.schedule?.schedule_id, f.adapter.schedule?.schedule_id); assert.equal(restored.cursor, f.adapter.cursor); assert.equal(reads, 1); assert.equal(restored.metrics.direct_read_calls, 1);
    });
    it('binds PLAN.v2 and D003 without provider, ENM, or protected effects', () => {
        const f = fixture(); assert.equal(PLAN_VERSION, 'PLAN.v2'); assert.deepEqual(EFFECT_ORDER.map((entry) => entry.effect), ['TASK_CREATE', 'TASK_RESUME', 'TASK_FORK', 'TASK_SEND', 'TASK_WAIT', 'TASK_READ']);
        assert.equal(f.adapter.metrics.provider_calls, 0); assert.equal(f.adapter.metrics.enm_e01_calls, 0); assert.equal(f.adapter.metrics.forge_calls, 0); assert.equal(f.adapter.metrics.protected_effects, 0); assertNegativeMetrics(f.adapter.metrics); assert.equal(f.adapter.schedule, null);
        const pairDigests: string[] = []; let equal = 0; let mismatch = 0;
        for (let seed = 0; seed < 100; seed += 1) {
            const left = replayFingerprint(seed); const right = replayFingerprint(seed); pairDigests.push(left + right);
            if (left === right) equal += 1; else mismatch += 1;
        }
        assert.equal(equal, 100); assert.equal(mismatch, 0);
        console.log(JSON.stringify({ replay_pairs: 100, equal, mismatch, replay_aggregate_sha256: sha256Utf8(pairDigests.join('')) }));
    });
});
