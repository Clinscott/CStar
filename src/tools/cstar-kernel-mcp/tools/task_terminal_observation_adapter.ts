import {
    ACTUAL_IDENTITY_UNREPORTED, CONTRACT_ID, EFFECT_ORDER, FAILURE_SUBCODES,
    OBSERVATION_FIELDS, PLAN_VERSION, SCHEDULE_CORE_FIELDS, TERMINAL_PACKET_FIELDS,
    type AdapterMetrics, type FailureSubcode, type HostCursorStatus, type ObservationRow,
    type ObservationSchedule, type ReasoningLevel, type SendAck, type TerminalPacket,
    type TerminalProjectionStatus, type TerminalState, type ThreadStatus,
    assertHash, assertNegativeMetrics, assertObservationSchedule, assertSendAck,
    assertTerminalPacket, assertTerminalResultProjection, canonicalSerialize, createAdapterMetrics, createObservationSchedule,
    createSendAck, createTerminalPacket, hashGeneric, initialObservationCursor,
    hashTerminalResultProjection, nextObservationCursor, sha256Utf8,
} from '../contracts/task_terminal_observation.js';

export interface EffectIntent {
    effect_id: string; idempotency_key: string; sequence: number; effect: string;
    payload_sha256: string; expected_revision: number; retry_count: number;
}
export interface TransportResult {
    effect_id: string; idempotency_key: string; status: 'ACK' | 'FAILURE' | 'UNKNOWN';
    ack_id: string | null; observed_revision: number | null; boundary: string | null;
    failure_code: 'TRANSPORT_REJECTED' | 'UNKNOWN_POST_EFFECT' | null; response_sha256: string | null;
}

export type AdapterPhase = 'READY' | 'SENT' | 'WAIT_SCHEDULED' | 'DELIVERED_UNVERIFIED' | 'REJECTED' | 'UNKNOWN';
export type AdapterStatus = 'ACK' | 'FAILURE' | 'UNKNOWN' | 'OBSERVATION_PENDING';
export type AdapterFailureCode = 'TRANSPORT_REJECTED' | 'UNKNOWN_POST_EFFECT' | 'DUPLICATE_EXTERNAL_EFFECT_FORBIDDEN' | 'POLLING_FORBIDDEN';
export type ExhaustionCause = 'MISSING' | 'UNAVAILABLE' | 'NONTERMINAL' | 'CONFLICTING' | 'TRANSCRIPT_ONLY' | 'MALFORMED_STRUCTURED_TERMINAL' | 'TARGET_IDENTITY_MISMATCH' | 'TURN_IDENTITY_MISMATCH' | 'TIMING_WINDOW_VIOLATION' | 'CURSOR_CONFLICT' | 'DIRECT_READ_LIMIT_EXCEEDED';
export const EXHAUSTION_CAUSES = Object.freeze([
    'MISSING', 'UNAVAILABLE', 'NONTERMINAL', 'CONFLICTING', 'TRANSCRIPT_ONLY',
    'MALFORMED_STRUCTURED_TERMINAL', 'TARGET_IDENTITY_MISMATCH', 'TURN_IDENTITY_MISMATCH',
    'TIMING_WINDOW_VIOLATION', 'CURSOR_CONFLICT', 'DIRECT_READ_LIMIT_EXCEEDED',
] as const);
export interface AdapterFailure { code: AdapterFailureCode; subcode?: FailureSubcode; exhaustion_cause?: ExhaustionCause; message: string; }

export interface AdapterContext {
    task_id: string; root_task_id: string; request_id: string; target_thread_id: string;
    send_intent: EffectIntent; wait_intent: EffectIntent; read_intent: EffectIntent;
    message: string; canonical_cwd_sha256: string; requested_model_selector: string;
    requested_reasoning: ReasoningLevel; actual_identity: string;
    actual_identity_attestation_sha256: string | null; host_id: string;
    send_requested_wall_time: string | number;
}
export interface NativeSendRequest {
    request_id: string; target_thread_id: string; send_idempotency_key: string;
    canonical_cwd_sha256: string; message: string; message_sha256: string; message_bytes: number;
    requested_model_selector: string; requested_reasoning: ReasoningLevel;
    actual_identity: string; actual_identity_attestation_sha256: string | null;
    send_requested_wall_time: string | number;
}
export interface NativeSendResponse {
    returned_thread_id: string | null; returned_turn_id: string | null;
    send_ack_wall_time: string | number | null; send_ack_monotonic_ms: number | null;
    host_id?: string; result_projection?: unknown;
}
export interface NativeReadRequest {
    contract_id: string; plan_version: string; schedule_id: string; task_id: string;
    root_task_id: string; effect_id: string; observation_index: number;
    target_thread_id: string; expected_turn_id: string; requested_at_monotonic_ms: number;
    exclude_transcript: true; read_request_sha256: string;
}
export interface NativeReadResponse {
    returned_thread_id: string | null; returned_turn_id: string | null;
    thread_status: ThreadStatus; terminal_projection_status: TerminalProjectionStatus;
    terminal_result_projection?: unknown; terminal_packet?: TerminalPacket;
    host_cursor?: string | null; host_cursor_status?: HostCursorStatus;
    transcript_included: boolean; read_result_projection_sha256?: string;
}
export interface NativeTaskControl { send(request: NativeSendRequest): NativeSendResponse; read(request: NativeReadRequest): NativeReadResponse; }
export interface AdapterSnapshot {
    snapshot_version: string; context: AdapterContext; phase: AdapterPhase; frozen: boolean;
    send_ack: SendAck | null; schedule: ObservationSchedule | null; observations: ObservationRow[];
    cursor: string | null; host_cursors: string[]; terminal_packet: TerminalPacket | null; metrics: AdapterMetrics;
}
export interface AdapterOutcome {
    status: AdapterStatus; phase: AdapterPhase; failure: AdapterFailure | null;
    exhaustion_cause: ExhaustionCause | null;
    transport_result: TransportResult | null; send_ack: SendAck | null;
    schedule: ObservationSchedule | null; observation: ObservationRow | null;
    terminal_packet: TerminalPacket | null; metrics: AdapterMetrics;
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function failure(code: AdapterFailureCode, subcode: FailureSubcode | undefined, message: string, exhaustionCause?: ExhaustionCause): AdapterFailure {
    return { code, ...(subcode ? { subcode } : {}), ...(exhaustionCause ? { exhaustion_cause: exhaustionCause } : {}), message };
}
function ackResult(intent: EffectIntent, ackId: string, responseSha256: string): TransportResult {
    return { effect_id: intent.effect_id, idempotency_key: intent.idempotency_key, status: 'ACK', ack_id: ackId, observed_revision: null, boundary: null, failure_code: null, response_sha256: responseSha256 };
}
function failureResult(intent: EffectIntent, code: 'TRANSPORT_REJECTED'): TransportResult {
    return { effect_id: intent.effect_id, idempotency_key: intent.idempotency_key, status: 'FAILURE', ack_id: null, observed_revision: null, boundary: null, failure_code: code, response_sha256: null };
}
function unknownResult(intent: EffectIntent): TransportResult {
    return { effect_id: intent.effect_id, idempotency_key: intent.idempotency_key, status: 'UNKNOWN', ack_id: null, observed_revision: null, boundary: 'after_transport_before_ack_persist', failure_code: 'UNKNOWN_POST_EFFECT', response_sha256: null };
}
function outcome(adapter: TaskTerminalObservationAdapter, status: AdapterStatus, failureValue: AdapterFailure | null, transport: TransportResult | null, observation: ObservationRow | null = null): AdapterOutcome {
    return { status, phase: adapter.phase, failure: failureValue, exhaustion_cause: failureValue?.exhaustion_cause ?? null, transport_result: transport, send_ack: adapter.send_ack, schedule: adapter.schedule, observation, terminal_packet: adapter.terminal_packet, metrics: clone(adapter.metrics) };
}
function projectionForRead(response: NativeReadResponse): Record<string, unknown> {
    let terminalResultProjectionSha256: string | null = null;
    if (response.terminal_result_projection !== undefined) {
        try {
            terminalResultProjectionSha256 = response.terminal_projection_status === 'STRUCTURED'
                ? hashTerminalResultProjection(response.terminal_result_projection)
                : hashGeneric(response.terminal_result_projection);
        } catch {
            terminalResultProjectionSha256 = hashGeneric(response.terminal_result_projection);
        }
    }
    return {
        returned_thread_id: response.returned_thread_id, returned_turn_id: response.returned_turn_id,
        thread_status: response.thread_status, terminal_projection_status: response.terminal_projection_status,
        terminal_result_projection_sha256: terminalResultProjectionSha256,
        terminal_packet_sha256: response.terminal_packet?.terminal_packet_sha256 ?? null,
        host_cursor: response.host_cursor ?? null, host_cursor_status: response.host_cursor_status ?? (response.host_cursor ? 'returned' : 'unavailable'),
        transcript_included: response.transcript_included,
    };
}
function scheduleWindow(schedule: ObservationSchedule, index: number): { due: number; close: number } {
    return index === 1 ? { due: schedule.read_1_due_ms, close: schedule.read_1_close_ms } : { due: schedule.read_2_due_ms, close: schedule.read_2_close_ms };
}
function terminalBinding(packet: TerminalPacket, context: AdapterContext, schedule: ObservationSchedule, sendAck: SendAck): boolean {
    return packet.contract_id === CONTRACT_ID && packet.schedule_id === schedule.schedule_id && packet.task_id === context.task_id && packet.root_task_id === context.root_task_id && packet.effect_id === context.read_intent.effect_id && packet.target_thread_id === sendAck.target_thread_id && packet.originating_turn_id === sendAck.returned_turn_id && packet.requested_model_selector === context.requested_model_selector && packet.requested_reasoning === context.requested_reasoning && packet.actual_identity === context.actual_identity && packet.actual_identity_attestation_sha256 === context.actual_identity_attestation_sha256;
}
function nonEmptyString(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function expectedProjection(context: AdapterContext, schedule: ObservationSchedule, sendAck: SendAck): Record<string, string> {
    return {
        task_id: schedule.task_id, root_task_id: schedule.root_task_id, effect_id: context.read_intent.effect_id,
        schedule_id: schedule.schedule_id, target_thread_id: sendAck.target_thread_id, originating_turn_id: sendAck.returned_turn_id,
    };
}
function defaultExhaustionCause(subcode: FailureSubcode | null): ExhaustionCause {
    if (subcode === 'OBSERVATION_CURSOR_CONFLICT') return 'CURSOR_CONFLICT';
    if (subcode === 'OBSERVATION_TARGET_MISMATCH') return 'TARGET_IDENTITY_MISMATCH';
    if (subcode === 'OBSERVATION_TURN_MISMATCH') return 'TURN_IDENTITY_MISMATCH';
    if (subcode === 'OBSERVATION_TOO_EARLY' || subcode === 'OBSERVATION_DEADLINE_MISSED') return 'TIMING_WINDOW_VIOLATION';
    if (subcode === 'TERMINAL_STRUCTURED_RESULT_UNAVAILABLE') return 'UNAVAILABLE';
    if (subcode === 'TERMINAL_OBSERVATION_EXHAUSTED') return 'MALFORMED_STRUCTURED_TERMINAL';
    return 'MALFORMED_STRUCTURED_TERMINAL';
}

export class TaskTerminalObservationAdapter {
    readonly context: AdapterContext;
    phase: AdapterPhase = 'READY';
    frozen = false;
    send_ack: SendAck | null = null;
    schedule: ObservationSchedule | null = null;
    observations: ObservationRow[] = [];
    cursor: string | null = null;
    host_cursors: string[] = [];
    terminal_packet: TerminalPacket | null = null;
    metrics: AdapterMetrics = createAdapterMetrics();

    constructor(context: AdapterContext, snapshot?: Partial<AdapterSnapshot>) {
        if (context.actual_identity === ACTUAL_IDENTITY_UNREPORTED) {
            if (context.actual_identity_attestation_sha256 !== null) throw new Error('unreported_identity_must_not_claim_attestation');
        } else assertHash(context.actual_identity_attestation_sha256);
        this.context = clone(context);
        if (snapshot) {
            this.phase = snapshot.phase ?? 'READY'; this.frozen = snapshot.frozen ?? false;
            this.send_ack = snapshot.send_ack ? clone(snapshot.send_ack) : null;
            this.schedule = snapshot.schedule ? clone(snapshot.schedule) : null;
            this.observations = clone(snapshot.observations ?? []); this.cursor = snapshot.cursor ?? null;
            this.host_cursors = clone(snapshot.host_cursors ?? []); this.terminal_packet = snapshot.terminal_packet ? clone(snapshot.terminal_packet) : null;
            this.metrics = clone(snapshot.metrics ?? createAdapterMetrics());
        }
    }

    send(host: NativeTaskControl): AdapterOutcome {
        if (this.phase !== 'READY' || this.frozen || this.metrics.native_send_calls !== 0) {
            this.metrics.duplicate_dispatches += 1;
            return outcome(this, 'FAILURE', failure('DUPLICATE_EXTERNAL_EFFECT_FORBIDDEN', undefined, 'TASK_SEND was already dispatched'), failureResult(this.context.send_intent, 'TRANSPORT_REJECTED'));
        }
        this.metrics.native_send_calls += 1; this.metrics.dispatches += 1;
        const messageSha = sha256Utf8(this.context.message);
        const request: NativeSendRequest = {
            request_id: this.context.request_id, target_thread_id: this.context.target_thread_id,
            send_idempotency_key: this.context.send_intent.idempotency_key, canonical_cwd_sha256: this.context.canonical_cwd_sha256,
            message: this.context.message, message_sha256: messageSha, message_bytes: Buffer.byteLength(this.context.message, 'utf8'),
            requested_model_selector: this.context.requested_model_selector, requested_reasoning: this.context.requested_reasoning,
            actual_identity: this.context.actual_identity, actual_identity_attestation_sha256: this.context.actual_identity_attestation_sha256,
            send_requested_wall_time: this.context.send_requested_wall_time,
        };
        let response: NativeSendResponse;
        try { response = host.send(request); } catch {
            return this.freeze('SEND_RESULT_AMBIGUOUS', 'native send raised after dispatch', this.context.send_intent);
        }
        if (!response) return outcome(this, 'FAILURE', failure('TRANSPORT_REJECTED', 'SEND_ACK_MISSING', 'native send returned no ACK'), failureResult(this.context.send_intent, 'TRANSPORT_REJECTED'));
        if (response.returned_thread_id !== this.context.target_thread_id || response.returned_thread_id === null) return outcome(this, 'FAILURE', failure('TRANSPORT_REJECTED', 'SEND_ACK_IDENTITY_MISMATCH', 'send ACK thread identity conflicts with target'), failureResult(this.context.send_intent, 'TRANSPORT_REJECTED'));
        if (!response.returned_turn_id || response.send_ack_wall_time === null || response.send_ack_monotonic_ms === null) return outcome(this, 'FAILURE', failure('TRANSPORT_REJECTED', 'SEND_ACK_MISSING', 'send ACK is missing a required host field'), failureResult(this.context.send_intent, 'TRANSPORT_REJECTED'));
        try {
            const resultProjection = response.result_projection ?? { returned_thread_id: response.returned_thread_id, returned_turn_id: response.returned_turn_id, send_ack_wall_time: response.send_ack_wall_time, send_ack_monotonic_ms: response.send_ack_monotonic_ms };
            const ack = createSendAck({
                request_id: this.context.request_id, target_thread_id: this.context.target_thread_id, request_target_thread_id: this.context.target_thread_id,
                returned_thread_id: response.returned_thread_id, returned_turn_id: response.returned_turn_id,
                send_idempotency_key: this.context.send_intent.idempotency_key, canonical_cwd_sha256: this.context.canonical_cwd_sha256,
                message_sha256: messageSha, message_bytes: Buffer.byteLength(this.context.message, 'utf8'),
                requested_model_selector: this.context.requested_model_selector, requested_reasoning: this.context.requested_reasoning,
                actual_identity: this.context.actual_identity, actual_identity_attestation_sha256: this.context.actual_identity_attestation_sha256,
                host_id: response.host_id ?? this.context.host_id, send_requested_wall_time: this.context.send_requested_wall_time,
                send_ack_wall_time: response.send_ack_wall_time, send_ack_monotonic_ms: response.send_ack_monotonic_ms,
                send_result_projection_sha256: hashGeneric(resultProjection),
            });
            this.send_ack = ack; this.metrics.send_ack_count += 1; this.phase = 'SENT';
            return outcome(this, 'ACK', null, ackResult(this.context.send_intent, 'send:' + ack.send_receipt_sha256, ack.send_receipt_sha256));
        } catch (error) {
            return outcome(this, 'FAILURE', failure('TRANSPORT_REJECTED', 'SEND_ACK_MISSING', error instanceof Error ? error.message : 'send ACK schema invalid'), failureResult(this.context.send_intent, 'TRANSPORT_REJECTED'));
        }
    }

    reserveWaitSchedule(): AdapterOutcome {
        if (this.phase !== 'SENT' || !this.send_ack || this.frozen) return outcome(this, 'FAILURE', failure('TRANSPORT_REJECTED', 'HOST_WAIT_HANDLER_UNAVAILABLE', 'TASK_WAIT schedule cannot be reserved before TASK_SEND ACK'), failureResult(this.context.wait_intent, 'TRANSPORT_REJECTED'));
        if (this.schedule) return outcome(this, 'FAILURE', failure('DUPLICATE_EXTERNAL_EFFECT_FORBIDDEN', undefined, 'TASK_WAIT schedule was already reserved'), failureResult(this.context.wait_intent, 'TRANSPORT_REJECTED'));
        try {
            this.schedule = createObservationSchedule({ task_id: this.context.task_id, root_task_id: this.context.root_task_id, effect_id: this.context.wait_intent.effect_id, idempotency_key: this.context.wait_intent.idempotency_key, target_thread_id: this.context.target_thread_id, returned_turn_id: this.send_ack.returned_turn_id, send_receipt_sha256: this.send_ack.send_receipt_sha256, send_ack_monotonic_ms: this.send_ack.send_ack_monotonic_ms });
            this.cursor = initialObservationCursor(this.schedule); this.phase = 'WAIT_SCHEDULED';
            return outcome(this, 'ACK', null, ackResult(this.context.wait_intent, this.schedule.ack_id, this.schedule.schedule_receipt_sha256));
        } catch (error) {
            return outcome(this, 'FAILURE', failure('TRANSPORT_REJECTED', 'HOST_WAIT_HANDLER_UNAVAILABLE', error instanceof Error ? error.message : 'schedule schema invalid'), failureResult(this.context.wait_intent, 'TRANSPORT_REJECTED'));
        }
    }

    read(host: NativeTaskControl, observedAtMonotonicMs: number): AdapterOutcome {
        if (this.phase !== 'WAIT_SCHEDULED' || !this.schedule || this.frozen) {
            if (this.frozen || this.observations.length >= 2) return outcome(this, 'FAILURE', failure('TRANSPORT_REJECTED', 'TERMINAL_OBSERVATION_EXHAUSTED', 'terminal observation budget is exhausted', 'DIRECT_READ_LIMIT_EXCEEDED'), failureResult(this.context.read_intent, 'TRANSPORT_REJECTED'));
            return outcome(this, 'FAILURE', failure('TRANSPORT_REJECTED', 'DIRECT_READ_LIMIT_EXCEEDED', 'TASK_READ is not admitted'), failureResult(this.context.read_intent, 'TRANSPORT_REJECTED'));
        }
        const index = this.observations.length + 1;
        if (index > 2) return outcome(this, 'FAILURE', failure('TRANSPORT_REJECTED', 'TERMINAL_OBSERVATION_EXHAUSTED', 'the frozen direct-read limit is two', 'DIRECT_READ_LIMIT_EXCEEDED'), failureResult(this.context.read_intent, 'TRANSPORT_REJECTED'));
        if (!Number.isInteger(observedAtMonotonicMs) || observedAtMonotonicMs < 0) {
            return index === 2
                ? this.freeze('TERMINAL_OBSERVATION_EXHAUSTED', 'observation monotonic time is invalid', this.context.read_intent, undefined, 'TIMING_WINDOW_VIOLATION')
                : this.freeze('OBSERVATION_DEADLINE_MISSED', 'observation monotonic time is invalid', this.context.read_intent);
        }
        const window = scheduleWindow(this.schedule, index), before = this.cursor!;
        const requestCore = {
            contract_id: CONTRACT_ID, plan_version: PLAN_VERSION, schedule_id: this.schedule.schedule_id, task_id: this.context.task_id,
            root_task_id: this.context.root_task_id, effect_id: this.context.read_intent.effect_id, observation_index: index,
            target_thread_id: this.context.target_thread_id, expected_turn_id: this.schedule.returned_turn_id,
            requested_at_monotonic_ms: observedAtMonotonicMs, exclude_transcript: true as const,
        };
        const readRequestSha256 = hashGeneric(requestCore);
        if (observedAtMonotonicMs < window.due) return this.recordTimingFailure(index, observedAtMonotonicMs, window, before, readRequestSha256, 'OBSERVATION_TOO_EARLY');
        if (observedAtMonotonicMs > window.close) return this.recordTimingFailure(index, observedAtMonotonicMs, window, before, readRequestSha256, 'OBSERVATION_DEADLINE_MISSED');
        const request: NativeReadRequest = { ...requestCore, read_request_sha256: readRequestSha256 };
        let response: NativeReadResponse;
        try { this.metrics.direct_read_calls += 1; response = host.read(request); } catch {
            return index === 2
                ? this.freeze('TERMINAL_OBSERVATION_EXHAUSTED', 'native structured read was unavailable', this.context.read_intent, undefined, 'UNAVAILABLE')
                : this.freeze('TERMINAL_STRUCTURED_RESULT_UNAVAILABLE', 'native structured read was unavailable', this.context.read_intent);
        }
        if (!response) {
            return index === 2
                ? this.freeze('TERMINAL_OBSERVATION_EXHAUSTED', 'native structured read returned no result', this.context.read_intent, undefined, 'MISSING')
                : this.freeze('TERMINAL_STRUCTURED_RESULT_UNAVAILABLE', 'native structured read returned no result', this.context.read_intent);
        }
        const projection = projectionForRead(response), readProjectionSha256 = hashGeneric(projection), readReceiptSha256 = hashGeneric({ read_request_sha256: readRequestSha256, read_result_projection_sha256: readProjectionSha256 });
        if (response.read_result_projection_sha256 && response.read_result_projection_sha256 !== readProjectionSha256) return this.recordFailureObservation(index, observedAtMonotonicMs, window, before, request, projection, readProjectionSha256, readReceiptSha256, 'OBSERVATION_CURSOR_CONFLICT', 'CONFLICTING');
        const cursorStatus = response.host_cursor_status ?? (response.host_cursor ? 'returned' : 'unavailable');
        if (cursorStatus !== 'returned' && cursorStatus !== 'unavailable') return this.recordFailureObservation(index, observedAtMonotonicMs, window, before, request, projection, readProjectionSha256, readReceiptSha256, 'OBSERVATION_CURSOR_CONFLICT', 'CURSOR_CONFLICT');
        if (cursorStatus === 'returned' && (!response.host_cursor || this.host_cursors.includes(response.host_cursor))) return this.recordFailureObservation(index, observedAtMonotonicMs, window, before, request, projection, readProjectionSha256, readReceiptSha256, 'OBSERVATION_CURSOR_CONFLICT', 'CURSOR_CONFLICT');
        const sendAck = this.send_ack;
        if (!sendAck || !nonEmptyString(response.returned_thread_id) || response.returned_thread_id !== sendAck.target_thread_id || response.returned_thread_id !== sendAck.returned_thread_id) return this.recordFailureObservation(index, observedAtMonotonicMs, window, before, request, projection, readProjectionSha256, readReceiptSha256, 'OBSERVATION_TARGET_MISMATCH', 'TARGET_IDENTITY_MISMATCH');
        if (!sendAck || !nonEmptyString(response.returned_turn_id) || response.returned_turn_id !== sendAck.returned_turn_id) return this.recordFailureObservation(index, observedAtMonotonicMs, window, before, request, projection, readProjectionSha256, readReceiptSha256, 'OBSERVATION_TURN_MISMATCH', 'TURN_IDENTITY_MISMATCH');
        const rowBase = { contract_id: CONTRACT_ID, schedule_id: this.schedule.schedule_id, task_id: this.context.task_id, root_task_id: this.context.root_task_id, effect_id: this.context.read_intent.effect_id, observation_index: index, target_thread_id: this.context.target_thread_id, expected_turn_id: this.schedule.returned_turn_id, returned_thread_id: response.returned_thread_id, returned_turn_id: response.returned_turn_id, requested_at_monotonic_ms: observedAtMonotonicMs, observed_at_monotonic_ms: observedAtMonotonicMs, due_at_monotonic_ms: window.due, close_at_monotonic_ms: window.close, elapsed_since_send_ms: observedAtMonotonicMs - this.schedule.send_ack_monotonic_ms, within_window: true as const, host_cursor: response.host_cursor ?? null, host_cursor_status: cursorStatus as HostCursorStatus, thread_status: response.thread_status, terminal_projection_status: response.terminal_projection_status, read_request_sha256: readRequestSha256, read_result_projection_sha256: readProjectionSha256, read_receipt_sha256: readReceiptSha256, cursor_before: before, cursor_after: null as string | null, transcript_included: false as const, terminal_packet_sha256: null as string | null, failure_subcode: null as FailureSubcode | null };
        if (response.transcript_included) return this.persistUnknownRow({ ...rowBase, terminal_projection_status: 'TRANSCRIPT_ONLY', failure_subcode: 'TERMINAL_STRUCTURED_RESULT_UNAVAILABLE' }, request, readReceiptSha256, undefined, 'TRANSCRIPT_ONLY');
        if (response.thread_status === 'NONTERMINAL' || response.thread_status === 'UNAVAILABLE' || response.terminal_projection_status === 'NONTERMINAL') {
            const row = { ...rowBase, cursor_after: nextObservationCursor(before, index, readRequestSha256, readReceiptSha256) } as ObservationRow;
            if (index === 1) return outcome(this, 'OBSERVATION_PENDING', null, null, this.persistRow(row));
            return this.persistUnknownRow({ ...row, failure_subcode: 'TERMINAL_OBSERVATION_EXHAUSTED' }, request, readReceiptSha256, undefined, response.thread_status === 'UNAVAILABLE' || response.terminal_projection_status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'NONTERMINAL');
        }
        if (response.thread_status !== 'TERMINAL' || response.terminal_projection_status !== 'STRUCTURED' || !response.terminal_packet) {
            const cause: ExhaustionCause = response.terminal_projection_status === 'UNAVAILABLE' ? 'UNAVAILABLE' : response.terminal_projection_status === 'TRANSCRIPT_ONLY' || response.transcript_included ? 'TRANSCRIPT_ONLY' : response.thread_status === 'UNKNOWN' && response.terminal_result_projection === undefined ? 'MISSING' : 'MALFORMED_STRUCTURED_TERMINAL';
            const primary: FailureSubcode = index === 2 ? 'TERMINAL_OBSERVATION_EXHAUSTED' : response.terminal_projection_status === 'TRANSCRIPT_ONLY' || response.terminal_projection_status === 'UNAVAILABLE' ? 'TERMINAL_STRUCTURED_RESULT_UNAVAILABLE' : 'TERMINAL_PACKET_MALFORMED';
            return this.persistUnknownRow({ ...rowBase, failure_subcode: primary }, request, readReceiptSha256, undefined, cause);
        }
        try {
            assertTerminalResultProjection(response.terminal_result_projection);
            const expected = expectedProjection(this.context, this.schedule, sendAck!);
            if (canonicalSerialize(Object.keys(expected), response.terminal_result_projection) !== canonicalSerialize(Object.keys(expected), expected)) throw new Error('terminal result projection binding mismatch');
            assertTerminalPacket(response.terminal_packet);
            if (!terminalBinding(response.terminal_packet, this.context, this.schedule, sendAck!)) throw new Error('terminal packet binding mismatch');
            if (response.terminal_packet.terminal_result_projection_sha256 !== hashTerminalResultProjection(response.terminal_result_projection)) throw new Error('terminal result projection hash mismatch');
        } catch (error) {
            return this.persistUnknownRow({ ...rowBase, failure_subcode: index === 2 ? 'TERMINAL_OBSERVATION_EXHAUSTED' : 'TERMINAL_PACKET_MALFORMED' }, request, readReceiptSha256, error instanceof Error ? error.message : 'terminal packet malformed', 'MALFORMED_STRUCTURED_TERMINAL');
        }
        const cursorAfter = nextObservationCursor(before, index, readRequestSha256, readReceiptSha256), row = this.persistRow({ ...rowBase, cursor_after: cursorAfter, terminal_packet_sha256: response.terminal_packet.terminal_packet_sha256 });
        this.terminal_packet = clone(response.terminal_packet); this.metrics.terminal_packet_count += 1;
        if (response.terminal_packet.outcome === 'DELIVERED_UNVERIFIED') { this.phase = 'DELIVERED_UNVERIFIED'; return outcome(this, 'ACK', null, ackResult(this.context.read_intent, 'read-terminal:' + response.terminal_packet.terminal_packet_sha256, readReceiptSha256), row); }
        if (response.terminal_packet.outcome === 'REJECTED') { this.phase = 'REJECTED'; return outcome(this, 'ACK', null, ackResult(this.context.read_intent, 'read-terminal:' + response.terminal_packet.terminal_packet_sha256, readReceiptSha256), row); }
        row.failure_subcode = 'TERMINAL_OBSERVATION_EXHAUSTED';
        return this.freeze('TERMINAL_OBSERVATION_EXHAUSTED', 'terminal packet outcome is UNKNOWN', this.context.read_intent, row, 'MALFORMED_STRUCTURED_TERMINAL');
    }

    private recordTimingFailure(index: number, observed: number, window: { due: number; close: number }, before: string, requestSha: string, subcode: FailureSubcode): AdapterOutcome {
        const row: ObservationRow = { contract_id: CONTRACT_ID, schedule_id: this.schedule!.schedule_id, task_id: this.context.task_id, root_task_id: this.context.root_task_id, effect_id: this.context.read_intent.effect_id, observation_index: index, target_thread_id: this.context.target_thread_id, expected_turn_id: this.schedule!.returned_turn_id, returned_thread_id: null, returned_turn_id: null, requested_at_monotonic_ms: observed, observed_at_monotonic_ms: observed, due_at_monotonic_ms: window.due, close_at_monotonic_ms: window.close, elapsed_since_send_ms: observed - this.schedule!.send_ack_monotonic_ms, within_window: false, host_cursor: null, host_cursor_status: 'unavailable', thread_status: 'UNKNOWN', terminal_projection_status: 'UNAVAILABLE', read_request_sha256: requestSha, read_result_projection_sha256: null, read_receipt_sha256: null, cursor_before: before, cursor_after: null, transcript_included: false, terminal_packet_sha256: null, failure_subcode: subcode };
        return this.persistUnknownRow(row, null, null, undefined, index === 2 ? 'TIMING_WINDOW_VIOLATION' : undefined);
    }
    private recordFailureObservation(index: number, observed: number, window: { due: number; close: number }, before: string, request: NativeReadRequest, projection: Record<string, unknown>, resultSha: string, receiptSha: string, subcode: FailureSubcode, exhaustionCause?: ExhaustionCause): AdapterOutcome {
        const row: ObservationRow = { contract_id: CONTRACT_ID, schedule_id: this.schedule!.schedule_id, task_id: this.context.task_id, root_task_id: this.context.root_task_id, effect_id: this.context.read_intent.effect_id, observation_index: index, target_thread_id: this.context.target_thread_id, expected_turn_id: this.schedule!.returned_turn_id, returned_thread_id: null, returned_turn_id: null, requested_at_monotonic_ms: observed, observed_at_monotonic_ms: observed, due_at_monotonic_ms: window.due, close_at_monotonic_ms: window.close, elapsed_since_send_ms: observed - this.schedule!.send_ack_monotonic_ms, within_window: true, host_cursor: null, host_cursor_status: 'unavailable', thread_status: 'UNKNOWN', terminal_projection_status: 'MALFORMED', read_request_sha256: request.read_request_sha256, read_result_projection_sha256: resultSha, read_receipt_sha256: receiptSha, cursor_before: before, cursor_after: null, transcript_included: false, terminal_packet_sha256: null, failure_subcode: subcode };
        return this.persistUnknownRow(row, request, receiptSha, JSON.stringify(projection), exhaustionCause);
    }
    private persistRow(row: ObservationRow): ObservationRow {
        const normalized = clone(row); this.observations.push(normalized); if (normalized.cursor_after !== null) this.cursor = normalized.cursor_after; if (normalized.host_cursor) this.host_cursors.push(normalized.host_cursor); return normalized;
    }
    private persistUnknownRow(row: ObservationRow, _request: NativeReadRequest | null, _receipt: string | null, _detail?: string, exhaustionCause?: ExhaustionCause): AdapterOutcome {
        const normalized = this.persistRow(row);
        const exhausted = normalized.observation_index >= 2;
        const primary = exhausted ? 'TERMINAL_OBSERVATION_EXHAUSTED' : normalized.failure_subcode ?? 'TERMINAL_PACKET_MALFORMED';
        normalized.failure_subcode = primary;
        const cause = exhausted ? exhaustionCause ?? defaultExhaustionCause(row.failure_subcode) : undefined;
        this.frozen = true; this.phase = 'UNKNOWN'; this.metrics.unknown_count += 1; this.metrics.acceptance_credit = 0;
        return outcome(this, 'UNKNOWN', failure('UNKNOWN_POST_EFFECT', primary, 'terminal observation cannot be proved', cause), unknownResult(this.context.read_intent), normalized);
    }
    private freeze(subcode: FailureSubcode, message: string, intent: EffectIntent, row?: ObservationRow, exhaustionCause?: ExhaustionCause): AdapterOutcome {
        this.frozen = true; this.phase = 'UNKNOWN'; this.metrics.unknown_count += 1; this.metrics.acceptance_credit = 0;
        return outcome(this, 'UNKNOWN', failure('UNKNOWN_POST_EFFECT', subcode, message, exhaustionCause), unknownResult(intent), row ?? null);
    }

    snapshot(): AdapterSnapshot {
        return { snapshot_version: 'cstar.task_terminal_observation.snapshot.v1', context: clone(this.context), phase: this.phase, frozen: this.frozen, send_ack: this.send_ack ? clone(this.send_ack) : null, schedule: this.schedule ? clone(this.schedule) : null, observations: clone(this.observations), cursor: this.cursor, host_cursors: clone(this.host_cursors), terminal_packet: this.terminal_packet ? clone(this.terminal_packet) : null, metrics: clone(this.metrics) };
    }
    snapshotSha256(): string { return hashGeneric(this.snapshot()); }
}

export function createTaskTerminalObservationAdapter(context: AdapterContext): TaskTerminalObservationAdapter { return new TaskTerminalObservationAdapter(context); }
export function rehydrateTaskTerminalObservationAdapter(snapshot: AdapterSnapshot, options: { host_restarted?: boolean } = {}): TaskTerminalObservationAdapter {
    if (snapshot.snapshot_version !== 'cstar.task_terminal_observation.snapshot.v1') throw new Error('snapshot_version_invalid');
    if (snapshot.schedule) assertObservationSchedule(snapshot.schedule); if (snapshot.send_ack) assertSendAck(snapshot.send_ack); if (snapshot.terminal_packet) assertTerminalPacket(snapshot.terminal_packet);
    const adapter = new TaskTerminalObservationAdapter(snapshot.context, snapshot);
    if (options.host_restarted && snapshot.schedule && snapshot.phase === 'WAIT_SCHEDULED') { adapter.frozen = true; adapter.phase = 'UNKNOWN'; adapter.metrics.unknown_count += 1; adapter.metrics.acceptance_credit = 0; }
    return adapter;
}
export function rejectPollingAttempt(): AdapterFailure { return failure('POLLING_FORBIDDEN', undefined, 'interval polling is outside the frozen adapter'); }
export function assertAdapterMetrics(metrics: AdapterMetrics): void {
    assertNegativeMetrics(metrics);
    if (metrics.native_send_calls !== 1 || metrics.send_ack_count > 1 || metrics.direct_read_calls > 2) throw new Error('adapter_metric_bound_exceeded');
}
export { canonicalSerialize, OBSERVATION_FIELDS, SCHEDULE_CORE_FIELDS, TERMINAL_PACKET_FIELDS, FAILURE_SUBCODES, createTerminalPacket };
