import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
    ACTUAL_IDENTITY_UNREPORTED, CANONICAL_MANIFEST_SHA256, EFFECT_ORDER, PLAN_VERSION,
    assertNegativeMetrics, createTerminalPacket, sha256Utf8,
} from '../../src/tools/cstar-kernel-mcp/contracts/task_terminal_observation.js';
import {
    assertAdapterMetrics, createTaskTerminalObservationAdapter, rehydrateTaskTerminalObservationAdapter,
    type AdapterContext, type NativeReadResponse,
} from '../../src/tools/cstar-kernel-mcp/tools/task_terminal_observation_adapter.js';
import {
    applyTransportResult, createRunnerRequest, createRunnerState, queueNextEffect,
} from '../../src/tools/cstar-kernel-mcp/contracts/deterministic_runner_hooks.js';
import type { EffectIntent, RunnerState, TransportResult } from '../../src/tools/cstar-kernel-mcp/contracts/deterministic_runner_hooks.js';

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
function terminal(fixture: ReturnType<typeof fixture>): NativeReadResponse {
    const schedule = fixture.adapter.schedule!;
    const packet = createTerminalPacket({
        schedule_id: schedule.schedule_id, task_id: fixture.context.task_id, root_task_id: fixture.context.root_task_id,
        effect_id: fixture.context.read_intent.effect_id, target_thread_id: fixture.context.target_thread_id, originating_turn_id: schedule.returned_turn_id,
        requested_model_selector: fixture.context.requested_model_selector, requested_reasoning: fixture.context.requested_reasoning,
        actual_identity: fixture.context.actual_identity, actual_identity_attestation_sha256: fixture.context.actual_identity_attestation_sha256,
        outcome: 'DELIVERED_UNVERIFIED', terminal_state: 'TERMINAL', terminal_result_projection: { task: fixture.context.task_id, terminal: true },
        artifacts_sha256: sha256Utf8('e2e-artifacts'), tests_sha256: sha256Utf8('e2e-tests'), terminal_manifest_sha256: CANONICAL_MANIFEST_SHA256, protected_effects: 0,
    });
    return { returned_thread_id: fixture.context.target_thread_id, returned_turn_id: schedule.returned_turn_id, thread_status: 'TERMINAL', terminal_projection_status: 'STRUCTURED', terminal_result_projection: { task: fixture.context.task_id, terminal: true }, terminal_packet: packet, host_cursor: null, host_cursor_status: 'unavailable', transcript_included: false };
}
function sendAndWait(fixture: ReturnType<typeof fixture>) {
    const calls = { send: 0, read: 0 };
    const host = { send: () => { calls.send += 1; return sendResponse(fixture.context); }, read: () => { calls.read += 1; return terminal(fixture); } };
    const sent = fixture.adapter.send(host); assert.equal(sent.status, 'ACK');
    const waited = fixture.adapter.reserveWaitSchedule(); assert.equal(waited.status, 'ACK');
    return { host, calls, sent, waited };
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
    });
});
