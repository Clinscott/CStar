import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    ACTUAL_IDENTITY_UNREPORTED, CANONICAL_CONTRACT_SHA256, CANONICAL_MANIFEST_SHA256,
    CONTRACT_ID, EFFECT_ORDER, FAILURE_SUBCODES, TERMINAL_RESULT_PROJECTION_FIELDS, WAIT_SCHEDULE_PROFILE,
    assertTerminalResultProjection, canonicalSerialize, createTerminalPacket, hashGeneric, hashTerminalResultProjection, sha256Utf8,
} from '../../../src/tools/cstar-kernel-mcp/contracts/task_terminal_observation.js';
import {
    createTaskTerminalObservationAdapter, rejectPollingAttempt,
    type AdapterContext, type EffectIntent, type ExhaustionCause, type NativeReadResponse, type NativeSendResponse, type TransportResult,
} from '../../../src/tools/cstar-kernel-mcp/tools/task_terminal_observation_adapter.js';

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
const reducerSha256 = sha256Utf8;

function ack(intent: EffectIntent, label: string): TransportResult {
    return { effect_id: intent.effect_id, idempotency_key: intent.idempotency_key, status: 'ACK', ack_id: 'fixture:' + label, observed_revision: null, boundary: null, failure_code: null, response_sha256: reducerSha256(label) };
}
function fixtures(taskId = 'task:terminal-observation') {
    let state = createRunnerState(createRunnerRequest({ task_id: taskId, root_task_id: taskId, scope: 'brain:CStar', requested_model_selector: 'gpt-5.6-luna', requested_reasoning: 'max' }));
    for (let sequence = 0; sequence < 3; sequence += 1) {
        const queued = queueNextEffect(state, state.revision, { sequence, fixture: 'prefix' });
        assert.equal(queued.outcome, 'OK'); state = applyTransportResult(queued.state, queued.state.revision, ack(queued.intent!, 'prefix-' + sequence)).state;
    }
    const sendQueued = queueNextEffect(state, state.revision, { sequence: 3, fixture: 'send' });
    const sendState = applyTransportResult(sendQueued.state, sendQueued.state.revision, ack(sendQueued.intent!, 'send')).state;
    const waitQueued = queueNextEffect(sendState, sendState.revision, { sequence: 4, fixture: 'wait' });
    const waitState = applyTransportResult(waitQueued.state, waitQueued.state.revision, ack(waitQueued.intent!, 'wait')).state;
    const readQueued = queueNextEffect(waitState, waitState.revision, { sequence: 5, fixture: 'read' });
    const context: AdapterContext = {
        task_id: taskId, root_task_id: taskId, request_id: 'request:' + taskId, target_thread_id: 'thread:' + taskId,
        send_intent: sendQueued.intent!, wait_intent: waitQueued.intent!, read_intent: readQueued.intent!,
        message: 'bounded terminal observation fixture', canonical_cwd_sha256: sha256Utf8('/cstar'),
        requested_model_selector: 'gpt-5.6-luna', requested_reasoning: 'max', actual_identity: ACTUAL_IDENTITY_UNREPORTED,
        actual_identity_attestation_sha256: null, host_id: 'unreported', send_requested_wall_time: '2026-08-14T12:00:00Z',
    };
    return { context, adapter: createTaskTerminalObservationAdapter(context), sendQueued, waitQueued, readQueued };
}
function sendResponse(overrides: Partial<NativeSendResponse> = {}): NativeSendResponse {
    return { returned_thread_id: 'thread:task:terminal-observation', returned_turn_id: 'turn:1', send_ack_wall_time: '2026-08-14T12:00:01Z', send_ack_monotonic_ms: 100, host_id: 'unreported', ...overrides };
}
function sendHost(response: NativeSendResponse | null | (() => NativeSendResponse)) {
    return { send: () => typeof response === 'function' ? response() : response!, read: () => { throw new Error('read not expected'); } };
}
function prepared() {
    const fixture = fixtures(); const sent = fixture.adapter.send(sendHost(sendResponse())); assert.equal(sent.status, 'ACK');
    const waited = fixture.adapter.reserveWaitSchedule(); assert.equal(waited.status, 'ACK');
    return { ...fixture, schedule: fixture.adapter.schedule! };
}
function terminalProjection(fixture: ReturnType<typeof prepared>) {
    return {
        task_id: fixture.context.task_id, root_task_id: fixture.context.root_task_id,
        effect_id: fixture.context.read_intent.effect_id, schedule_id: fixture.schedule.schedule_id,
        target_thread_id: fixture.context.target_thread_id, originating_turn_id: fixture.schedule.returned_turn_id,
    } as const;
}
function packet(fixture: ReturnType<typeof prepared>, outcome: 'DELIVERED_UNVERIFIED' | 'REJECTED' | 'UNKNOWN' = 'DELIVERED_UNVERIFIED') {
    return createTerminalPacket({
        schedule_id: fixture.schedule.schedule_id, task_id: fixture.context.task_id, root_task_id: fixture.context.root_task_id,
        effect_id: fixture.context.read_intent.effect_id, target_thread_id: fixture.context.target_thread_id,
        originating_turn_id: fixture.schedule.returned_turn_id, requested_model_selector: fixture.context.requested_model_selector,
        requested_reasoning: fixture.context.requested_reasoning, actual_identity: fixture.context.actual_identity,
        actual_identity_attestation_sha256: fixture.context.actual_identity_attestation_sha256, outcome,
        terminal_state: outcome === 'REJECTED' ? 'REJECTED' : outcome === 'UNKNOWN' ? 'UNKNOWN' : 'TERMINAL',
        terminal_result_projection: terminalProjection(fixture),
        artifacts_sha256: sha256Utf8('artifacts'), tests_sha256: sha256Utf8('tests'), terminal_manifest_sha256: CANONICAL_MANIFEST_SHA256, protected_effects: 0,
    });
}
function terminalResponse(fixture: ReturnType<typeof prepared>, overrides: Partial<NativeReadResponse> = {}): NativeReadResponse {
    return { returned_thread_id: fixture.context.target_thread_id, returned_turn_id: fixture.schedule.returned_turn_id, thread_status: 'TERMINAL', terminal_projection_status: 'STRUCTURED', terminal_result_projection: terminalProjection(fixture), terminal_packet: packet(fixture), host_cursor: null, host_cursor_status: 'unavailable', transcript_included: false, ...overrides };
}
function readHost(response: NativeReadResponse | (() => NativeReadResponse)) {
    return { send: () => sendResponse(), read: () => typeof response === 'function' ? response() : response };
}

describe('CSO-D004/D003 terminal observation adapter', () => {
    it('binds the manifest, exact field order, and UTF-8 hashing', () => {
        assert.equal(CONTRACT_ID, 'corvus.task_control.terminal_observation.v1');
        assert.equal(CANONICAL_MANIFEST_SHA256.length, 64); assert.equal(CANONICAL_CONTRACT_SHA256.length, 64);
        assert.match(canonicalSerialize(['a', 'b'], { a: 1, b: 'é' }), /^\{"a":1,"b":"é"\}$/);
        assert.equal(sha256Utf8('é'), '4a99557e4033c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c');
        assert.equal(hashGeneric({ b: 1, a: 2 }), hashGeneric({ a: 2, b: 1 }));
        const fixture = prepared(); const valid = terminalProjection(fixture);
        assert.deepEqual(Object.keys(valid), [...TERMINAL_RESULT_PROJECTION_FIELDS]); assertTerminalResultProjection(valid);
        assert.equal(hashTerminalResultProjection(valid).length, 64);
        const structurallyValidConflict = { ...valid, originating_turn_id: 'turn:other' };
        assert.doesNotThrow(() => assertTerminalResultProjection(structurallyValidConflict));
        const negatives: unknown[] = [null, { ...valid, extra: true }, { ...valid, task_id: null }];
        for (const candidate of negatives) assert.throws(() => assertTerminalResultProjection(candidate));
        assert.throws(() => createTerminalPacket({ ...packet(fixture), terminal_result_projection: { ...valid, target_thread_id: 'thread:other' } as never }));
        const adapterSource = readFileSync(new URL('../../../src/tools/cstar-kernel-mcp/tools/task_terminal_observation_adapter.ts', import.meta.url), 'utf8');
        const staticChecks = [
            !/host\.wait\s*\(/.test(adapterSource), !/setInterval\s*\(|setTimeout\s*\(/.test(adapterSource),
            !/transcript[^\n]*parse|parse[^\n]*transcript/i.test(adapterSource),
            (adapterSource.match(/host\.send\s*\(/g) ?? []).length === 1,
            !/\.retry\s*\(|\.replay\s*\(/.test(adapterSource), !/from ['"][^'"]*forge[^'"]*['"]/i.test(adapterSource),
            !/host\s*\[/.test(adapterSource),
        ];
        staticChecks.forEach((passed) => assert.equal(passed, true));
        console.log(JSON.stringify({ schema_positive_rows: 2, schema_negative_rows: 3, packet_binding_negative_rows: 1, static_call_graph_assertions: staticChecks.length, static_call_graph_pass: staticChecks.filter(Boolean).length }));
    });
    it('preserves the six-effect order exactly', () => {
        assert.deepEqual(EFFECT_ORDER.map((entry) => entry.effect), ['TASK_CREATE', 'TASK_RESUME', 'TASK_FORK', 'TASK_SEND', 'TASK_WAIT', 'TASK_READ']);
        assert.equal(EFFECT_ORDER.length, 6);
    });
    it('derives the hash-bound schedule and predetermined observation windows', () => {
        const fixture = prepared();
        assert.equal(fixture.schedule.send_ack_monotonic_ms, 100); assert.equal(fixture.schedule.read_1_due_ms, 1_080_100);
        assert.equal(fixture.schedule.read_1_close_ms, 1_110_100); assert.equal(fixture.schedule.read_2_due_ms, 1_200_100);
        assert.equal(fixture.schedule.read_2_close_ms, 1_230_100); assert.match(fixture.schedule.schedule_id, /^observation:[a-f0-9]{64}$/);
        assert.equal(fixture.schedule.max_direct_reads, WAIT_SCHEDULE_PROFILE.max_direct_reads);
    });
    it('records TASK_WAIT as a schedule ACK with zero native wait and polling calls', () => {
        const fixture = fixtures(); fixture.adapter.send(sendHost(sendResponse())); const result = fixture.adapter.reserveWaitSchedule();
        assert.equal(result.status, 'ACK'); assert.equal(result.transport_result?.ack_id, fixture.adapter.schedule?.ack_id);
        assert.equal(fixture.adapter.metrics.native_wait_calls, 0); assert.equal(fixture.adapter.metrics.interval_poll_calls, 0);
    });
    it('keeps requested selector and actual identity separate in the send ACK', () => {
        const fixture = fixtures(); let seen: NativeSendResponse | undefined;
        const result = fixture.adapter.send({ send: (request) => { assert.equal(request.requested_model_selector, 'gpt-5.6-luna'); assert.equal(request.actual_identity, 'unreported'); seen = sendResponse(); return seen; }, read: () => { throw new Error('read not expected'); } });
        assert.equal(result.status, 'ACK'); assert.equal(fixture.adapter.send_ack?.requested_model_selector, 'gpt-5.6-luna');
        assert.equal(fixture.adapter.send_ack?.actual_identity, ACTUAL_IDENTITY_UNREPORTED); assert.equal(fixture.adapter.send_ack?.actual_identity_attestation_sha256, null);
    });
    it('freezes an ambiguous post-send result as UNKNOWN without retry', () => {
        const fixture = fixtures(); const result = fixture.adapter.send({ send: () => { throw new Error('connection ended after send'); }, read: () => { throw new Error('read not expected'); } });
        assert.equal(result.status, 'UNKNOWN'); assert.equal(result.failure?.subcode, 'SEND_RESULT_AMBIGUOUS');
        assert.equal(fixture.adapter.metrics.native_send_calls, 1); assert.equal(fixture.adapter.metrics.retries, 0); assert.equal(fixture.adapter.frozen, true);
    });
    it('rejects a target-conflicting send ACK', () => {
        const fixture = fixtures(); const result = fixture.adapter.send(sendHost(sendResponse({ returned_thread_id: 'other-thread' })));
        assert.equal(result.status, 'FAILURE'); assert.equal(result.failure?.subcode, 'SEND_ACK_IDENTITY_MISMATCH'); assert.equal(fixture.adapter.phase, 'READY');
    });
    it('rejects a missing send ACK as transport failure', () => {
        const fixture = fixtures(); const result = fixture.adapter.send(sendHost(null));
        assert.equal(result.status, 'FAILURE'); assert.equal(result.failure?.subcode, 'SEND_ACK_MISSING'); assert.equal(result.transport_result?.failure_code, 'TRANSPORT_REJECTED');
    });
    it('forbids duplicate dispatch after the one native send', () => {
        const fixture = fixtures(); const host = sendHost(sendResponse()); assert.equal(fixture.adapter.send(host).status, 'ACK');
        const duplicate = fixture.adapter.send(host); assert.equal(duplicate.failure?.code, 'DUPLICATE_EXTERNAL_EFFECT_FORBIDDEN');
        assert.equal(fixture.adapter.metrics.native_send_calls, 1); assert.equal(fixture.adapter.metrics.duplicate_dispatches, 1);
    });
    it('freezes an observation requested before its due time', () => {
        const fixture = prepared(); const result = fixture.adapter.read(readHost(terminalResponse(fixture)), fixture.schedule.read_1_due_ms - 1);
        assert.equal(result.status, 'UNKNOWN'); assert.equal(result.failure?.subcode, 'OBSERVATION_TOO_EARLY'); assert.equal(fixture.adapter.metrics.direct_read_calls, 0);
    });
    it('freezes an observation requested after its close time', () => {
        const fixture = prepared(); const result = fixture.adapter.read(readHost(terminalResponse(fixture)), fixture.schedule.read_1_close_ms + 1);
        assert.equal(result.status, 'UNKNOWN'); assert.equal(result.failure?.subcode, 'OBSERVATION_DEADLINE_MISSED'); assert.equal(fixture.adapter.metrics.direct_read_calls, 0);
    });
    it('ACKs a valid structured terminal packet on observation one', () => {
        const fixture = prepared(); const result = fixture.adapter.read(readHost(terminalResponse(fixture)), fixture.schedule.read_1_due_ms);
        assert.equal(result.status, 'ACK'); assert.equal(result.transport_result?.status, 'ACK'); assert.equal(fixture.adapter.phase, 'DELIVERED_UNVERIFIED');
        assert.equal(fixture.adapter.metrics.direct_read_calls, 1); assert.equal(fixture.adapter.metrics.terminal_packet_count, 1); assert.equal(result.observation?.transcript_included, false);
    });
    it('reserves observation two after a known nonterminal first read and ACKs it when terminal', () => {
        const fixture = prepared(); let calls = 0;
        const result1 = fixture.adapter.read(readHost(() => { calls += 1; return { returned_thread_id: fixture.context.target_thread_id, returned_turn_id: fixture.schedule.returned_turn_id, thread_status: 'NONTERMINAL', terminal_projection_status: 'NONTERMINAL', host_cursor: null, host_cursor_status: 'unavailable', transcript_included: false }; }), fixture.schedule.read_1_due_ms);
        assert.equal(result1.status, 'OBSERVATION_PENDING');
        const result2 = fixture.adapter.read(readHost(() => { calls += 1; return terminalResponse(fixture); }), fixture.schedule.read_2_due_ms);
        assert.equal(result2.status, 'ACK'); assert.equal(calls, 2); assert.equal(fixture.adapter.metrics.direct_read_calls, 2);
    });
    it('freezes an inconclusive second nonterminal read as exhausted', () => {
        const causes: Array<{ cause: ExhaustionCause; second: (fixture: ReturnType<typeof prepared>) => NativeReadResponse | null; firstCursor?: string; time?: (fixture: ReturnType<typeof prepared>) => number }> = [
            { cause: 'MISSING', second: () => null },
            { cause: 'UNAVAILABLE', second: (f) => ({ returned_thread_id: f.context.target_thread_id, returned_turn_id: f.schedule.returned_turn_id, thread_status: 'UNAVAILABLE', terminal_projection_status: 'UNAVAILABLE', host_cursor: null, host_cursor_status: 'unavailable', transcript_included: false }) },
            { cause: 'NONTERMINAL', second: (f) => ({ returned_thread_id: f.context.target_thread_id, returned_turn_id: f.schedule.returned_turn_id, thread_status: 'NONTERMINAL', terminal_projection_status: 'NONTERMINAL', host_cursor: null, host_cursor_status: 'unavailable', transcript_included: false }) },
            { cause: 'CONFLICTING', second: (f) => terminalResponse(f, { read_result_projection_sha256: sha256Utf8('wrong-read-result') }) },
            { cause: 'TRANSCRIPT_ONLY', second: (f) => terminalResponse(f, { transcript_included: true, terminal_projection_status: 'TRANSCRIPT_ONLY' }) },
            { cause: 'MALFORMED_STRUCTURED_TERMINAL', second: (f) => terminalResponse(f, { terminal_result_projection: null, terminal_packet: undefined }) },
            { cause: 'TARGET_IDENTITY_MISMATCH', second: (f) => terminalResponse(f, { returned_thread_id: 'thread:other' }) },
            { cause: 'TURN_IDENTITY_MISMATCH', second: (f) => terminalResponse(f, { returned_turn_id: 'turn:other' }) },
            { cause: 'TIMING_WINDOW_VIOLATION', second: (f) => terminalResponse(f), time: (f) => f.schedule.read_2_due_ms - 1 },
            { cause: 'CURSOR_CONFLICT', firstCursor: 'cursor:1', second: (f) => terminalResponse(f, { host_cursor: 'cursor:1', host_cursor_status: 'returned' }) },
        ];
        for (const testCase of causes) {
            const fixture = prepared();
            const first: NativeReadResponse = { returned_thread_id: fixture.context.target_thread_id, returned_turn_id: fixture.schedule.returned_turn_id, thread_status: 'NONTERMINAL', terminal_projection_status: 'NONTERMINAL', host_cursor: testCase.firstCursor ?? null, host_cursor_status: testCase.firstCursor ? 'returned' : 'unavailable', transcript_included: false };
            assert.equal(fixture.adapter.read(readHost(first), fixture.schedule.read_1_due_ms).status, 'OBSERVATION_PENDING');
            const second = fixture.adapter.read(readHost(() => testCase.second(fixture) as NativeReadResponse), testCase.time?.(fixture) ?? fixture.schedule.read_2_due_ms);
            assert.equal(second.status, 'UNKNOWN'); assert.equal(second.failure?.subcode, 'TERMINAL_OBSERVATION_EXHAUSTED'); assert.equal(second.failure?.exhaustion_cause, testCase.cause); assert.equal(second.exhaustion_cause, testCase.cause); assert.equal(fixture.adapter.metrics.unknown_count, 1);
        }
        const budget = prepared(); const nonterminal = (): NativeReadResponse => ({ returned_thread_id: budget.context.target_thread_id, returned_turn_id: budget.schedule.returned_turn_id, thread_status: 'NONTERMINAL', terminal_projection_status: 'NONTERMINAL', host_cursor: null, host_cursor_status: 'unavailable', transcript_included: false });
        assert.equal(budget.adapter.read(readHost(nonterminal), budget.schedule.read_1_due_ms).status, 'OBSERVATION_PENDING');
        assert.equal(budget.adapter.read(readHost(nonterminal), budget.schedule.read_2_due_ms).failure?.exhaustion_cause, 'NONTERMINAL');
        const exhausted = budget.adapter.read(readHost(terminalResponse(budget)), budget.schedule.read_2_due_ms);
        assert.equal(exhausted.status, 'FAILURE'); assert.equal(exhausted.failure?.subcode, 'TERMINAL_OBSERVATION_EXHAUSTED'); assert.equal(exhausted.failure?.exhaustion_cause, 'DIRECT_READ_LIMIT_EXCEEDED'); assert.equal(budget.adapter.metrics.direct_read_calls, 2);
    });
    it('freezes a malformed second terminal packet as exhausted', () => {
        const fixture = prepared(); const nonterminal: NativeReadResponse = { returned_thread_id: fixture.context.target_thread_id, returned_turn_id: fixture.schedule.returned_turn_id, thread_status: 'NONTERMINAL', terminal_projection_status: 'NONTERMINAL', transcript_included: false };
        assert.equal(fixture.adapter.read(readHost(nonterminal), fixture.schedule.read_1_due_ms).status, 'OBSERVATION_PENDING');
        const malformed = terminalResponse(fixture, { terminal_packet: {} as never }); const result = fixture.adapter.read(readHost(malformed), fixture.schedule.read_2_due_ms);
        assert.equal(result.status, 'UNKNOWN'); assert.equal(result.failure?.subcode, 'TERMINAL_OBSERVATION_EXHAUSTED');
    });
    it('freezes when structured terminal result is unavailable', () => {
        const fixture = prepared(); const result = fixture.adapter.read(readHost(terminalResponse(fixture, { terminal_projection_status: 'UNAVAILABLE', terminal_packet: undefined })), fixture.schedule.read_1_due_ms);
        assert.equal(result.status, 'UNKNOWN'); assert.equal(result.failure?.subcode, 'TERMINAL_STRUCTURED_RESULT_UNAVAILABLE'); assert.equal(fixture.adapter.metrics.transcript_authority, 0);
        const invalidProjections: unknown[] = [undefined, null, 'malformed', { ...terminalProjection(fixture), extra: true }, { ...terminalProjection(fixture), originating_turn_id: 'turn:other' }];
        for (const invalid of invalidProjections) {
            const adversary = prepared(); const invalidResult = adversary.adapter.read(readHost(terminalResponse(adversary, { terminal_result_projection: invalid })), adversary.schedule.read_1_due_ms);
            assert.equal(invalidResult.status, 'UNKNOWN'); assert.equal(invalidResult.failure?.subcode, 'TERMINAL_PACKET_MALFORMED'); assert.equal(adversary.adapter.phase, 'UNKNOWN');
        }
    });
    it('rejects a target mismatch in a structured read', () => {
        for (const returned_thread_id of [null, '', 42, 'other-thread'] as unknown[]) {
            const fixture = prepared(); const result = fixture.adapter.read(readHost(terminalResponse(fixture, { returned_thread_id: returned_thread_id as never })), fixture.schedule.read_1_due_ms);
            assert.equal(result.status, 'UNKNOWN'); assert.equal(result.failure?.subcode, 'OBSERVATION_TARGET_MISMATCH');
        }
    });
    it('rejects a returned turn mismatch in a structured read', () => {
        for (const returned_turn_id of [null, '', 42, 'turn:other'] as unknown[]) {
            const fixture = prepared(); const result = fixture.adapter.read(readHost(terminalResponse(fixture, { returned_turn_id: returned_turn_id as never })), fixture.schedule.read_1_due_ms);
            assert.equal(result.status, 'UNKNOWN'); assert.equal(result.failure?.subcode, 'OBSERVATION_TURN_MISMATCH');
        }
        const fixture = prepared(); const projectionMismatch = fixture.adapter.read(readHost(terminalResponse(fixture, { terminal_result_projection: { ...terminalProjection(fixture), originating_turn_id: 'turn:other' } })), fixture.schedule.read_1_due_ms);
        assert.equal(projectionMismatch.status, 'UNKNOWN'); assert.equal(projectionMismatch.failure?.subcode, 'TERMINAL_PACKET_MALFORMED');
        assert.equal(projectionMismatch.phase, 'UNKNOWN'); assert.equal(projectionMismatch.metrics.acceptance_credit, 0);
        assert.notEqual(projectionMismatch.status, 'ACK'); assert.notEqual(projectionMismatch.phase, 'DELIVERED_UNVERIFIED');
        assert.equal(projectionMismatch.terminal_packet, null);
    });
    it('freezes on host cursor reuse or cursor-chain conflict', () => {
        const fixture = prepared(); const first: NativeReadResponse = { returned_thread_id: fixture.context.target_thread_id, returned_turn_id: fixture.schedule.returned_turn_id, thread_status: 'NONTERMINAL', terminal_projection_status: 'NONTERMINAL', host_cursor: 'cursor-1', host_cursor_status: 'returned', transcript_included: false };
        assert.equal(fixture.adapter.read(readHost(first), fixture.schedule.read_1_due_ms).status, 'OBSERVATION_PENDING');
        const result = fixture.adapter.read(readHost(terminalResponse(fixture, { host_cursor: 'cursor-1', host_cursor_status: 'returned' })), fixture.schedule.read_2_due_ms);
        assert.equal(result.status, 'UNKNOWN'); assert.equal(result.failure?.subcode, 'TERMINAL_OBSERVATION_EXHAUSTED');
        assert.equal(result.failure?.exhaustion_cause, 'CURSOR_CONFLICT'); assert.equal(result.exhaustion_cause, 'CURSOR_CONFLICT');
        assert.equal(result.phase, 'UNKNOWN'); assert.equal(result.metrics.acceptance_credit, 0); assert.equal(result.metrics.direct_read_calls, 2);
    });
    it('rejects transcript-only authority even when prose contains terminal text', () => {
        const fixture = prepared(); const result = fixture.adapter.read(readHost(terminalResponse(fixture, { transcript_included: true, terminal_projection_status: 'TRANSCRIPT_ONLY' })), fixture.schedule.read_1_due_ms);
        assert.equal(result.status, 'UNKNOWN'); assert.equal(result.failure?.subcode, 'TERMINAL_STRUCTURED_RESULT_UNAVAILABLE'); assert.equal(fixture.adapter.metrics.transcript_authority, 0);
    });
    it('never permits a third direct read after the two-read budget', () => {
        const fixture = prepared(); const nonterminal: NativeReadResponse = { returned_thread_id: fixture.context.target_thread_id, returned_turn_id: fixture.schedule.returned_turn_id, thread_status: 'NONTERMINAL', terminal_projection_status: 'NONTERMINAL', transcript_included: false };
        assert.equal(fixture.adapter.read(readHost(nonterminal), fixture.schedule.read_1_due_ms).status, 'OBSERVATION_PENDING'); assert.equal(fixture.adapter.read(readHost(terminalResponse(fixture)), fixture.schedule.read_2_due_ms).status, 'ACK');
        const result = fixture.adapter.read(readHost(terminalResponse(fixture)), fixture.schedule.read_2_due_ms); assert.equal(result.status, 'FAILURE'); assert.equal(result.failure?.subcode, 'TERMINAL_OBSERVATION_EXHAUSTED'); assert.equal(result.failure?.exhaustion_cause, 'DIRECT_READ_LIMIT_EXCEEDED'); assert.equal(fixture.adapter.metrics.direct_read_calls, 2);
    });
    it('exposes polling as a typed forbidden operation', () => {
        const result = rejectPollingAttempt(); assert.equal(result.code, 'POLLING_FORBIDDEN'); assert.equal(FAILURE_SUBCODES.includes('HOST_WAIT_HANDLER_UNAVAILABLE'), true);
    });
    it('gives UNKNOWN zero acceptance credit and no continuation', () => {
        const fixture = fixtures(); const result = fixture.adapter.send({ send: () => { throw new Error('ambiguous'); }, read: () => { throw new Error('read not expected'); } });
        assert.equal(result.status, 'UNKNOWN'); assert.equal(fixture.adapter.metrics.acceptance_credit, 0); assert.equal(fixture.adapter.metrics.retries, 0); assert.equal(fixture.adapter.metrics.replays, 0);
        assert.equal(fixture.adapter.reserveWaitSchedule().status, 'FAILURE');
    });
    it('accepts a host-attested actual identity without conflating the request selector', () => {
        const fixture = fixtures(); const attestation = sha256Utf8('host-attestation'); fixture.context.actual_identity = 'host:attested'; fixture.context.actual_identity_attestation_sha256 = attestation;
        const adapter = createTaskTerminalObservationAdapter(fixture.context); const seen: NativeSendResponse = sendResponse(); const result = adapter.send({ send: (request) => { assert.equal(request.requested_model_selector, 'gpt-5.6-luna'); assert.equal(request.actual_identity, 'host:attested'); assert.equal(request.actual_identity_attestation_sha256, attestation); return seen; }, read: () => { throw new Error('read not expected'); } });
        assert.equal(result.status, 'ACK'); assert.equal(adapter.send_ack?.actual_identity, 'host:attested'); assert.equal(adapter.send_ack?.requested_model_selector, 'gpt-5.6-luna');
    });
});
