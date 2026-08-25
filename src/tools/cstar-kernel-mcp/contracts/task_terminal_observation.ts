import { createHash } from 'node:crypto';

export const CONTRACT_ID = 'corvus.task_control.terminal_observation.v1';
export const SCHEMA_VERSION = 'corvus.task_control.terminal_observation.schema.v1';
export const PLAN_VERSION = 'PLAN.v2';
export const ACTUAL_IDENTITY_UNREPORTED = 'unreported';
export const UTF8_ENCODING = 'UTF-8';

export const EFFECT_ORDER = Object.freeze([
    { sequence: 0, effect: 'TASK_CREATE' },
    { sequence: 1, effect: 'TASK_RESUME' },
    { sequence: 2, effect: 'TASK_FORK' },
    { sequence: 3, effect: 'TASK_SEND' },
    { sequence: 4, effect: 'TASK_WAIT' },
    { sequence: 5, effect: 'TASK_READ' },
] as const);
export const TRANSPORT_EFFECTS = EFFECT_ORDER.map((entry) => entry.effect);
export type TransportEffect = typeof EFFECT_ORDER[number]['effect'];
export type ReasoningLevel = 'minimal' | 'low' | 'medium' | 'high' | 'max';

export const WAIT_SCHEDULE_PROFILE = Object.freeze({
    hard_lease_ms: 1_200_000,
    observation_1_offset_ms: 1_080_000,
    observation_2_offset_ms: 1_200_000,
    observation_grace_ms: 30_000,
    max_direct_reads: 2,
    native_wait_calls: 0,
    interval_poll_calls: 0,
});

export const FAILURE_SUBCODES = Object.freeze([
    'HOST_WAIT_HANDLER_UNAVAILABLE',
    'SEND_ACK_MISSING',
    'SEND_ACK_IDENTITY_MISMATCH',
    'SEND_RESULT_AMBIGUOUS',
    'OBSERVATION_TOO_EARLY',
    'OBSERVATION_DEADLINE_MISSED',
    'OBSERVATION_CURSOR_CONFLICT',
    'OBSERVATION_TARGET_MISMATCH',
    'OBSERVATION_TURN_MISMATCH',
    'TERMINAL_STRUCTURED_RESULT_UNAVAILABLE',
    'TERMINAL_PACKET_MALFORMED',
    'TERMINAL_OBSERVATION_EXHAUSTED',
    'DIRECT_READ_LIMIT_EXCEEDED',
] as const);
export type FailureSubcode = typeof FAILURE_SUBCODES[number];

export const SCHEDULE_CORE_FIELDS = [
    'contract_id', 'task_id', 'root_task_id', 'effect_id', 'idempotency_key',
    'target_thread_id', 'returned_turn_id', 'send_receipt_sha256',
    'send_ack_monotonic_ms', 'hard_lease_ms', 'observation_1_offset_ms',
    'observation_2_offset_ms', 'observation_grace_ms', 'max_direct_reads',
] as const;
export const SCHEDULE_RECEIPT_FIELDS = [
    ...SCHEDULE_CORE_FIELDS, 'schedule_id', 'ack_id', 'read_1_due_ms',
    'read_1_close_ms', 'read_2_due_ms', 'read_2_close_ms',
] as const;
export const SEND_ACK_CORE_FIELDS = [
    'request_id', 'target_thread_id', 'request_target_thread_id',
    'returned_thread_id', 'returned_turn_id', 'send_idempotency_key',
    'canonical_cwd_sha256', 'message_sha256', 'message_bytes',
    'requested_model_selector', 'requested_reasoning', 'actual_identity',
    'actual_identity_attestation_sha256', 'host_id', 'send_requested_wall_time',
    'send_ack_wall_time', 'send_ack_monotonic_ms', 'send_result_projection_sha256',
] as const;
export const SEND_ACK_FIELDS = [...SEND_ACK_CORE_FIELDS, 'send_receipt_sha256'] as const;
export const OBSERVATION_FIELDS = [
    'contract_id', 'schedule_id', 'task_id', 'root_task_id', 'effect_id',
    'observation_index', 'target_thread_id', 'expected_turn_id',
    'returned_thread_id', 'returned_turn_id', 'requested_at_monotonic_ms',
    'observed_at_monotonic_ms', 'due_at_monotonic_ms', 'close_at_monotonic_ms',
    'elapsed_since_send_ms', 'within_window', 'host_cursor', 'host_cursor_status',
    'thread_status', 'terminal_projection_status', 'read_request_sha256',
    'read_result_projection_sha256', 'read_receipt_sha256', 'cursor_before',
    'cursor_after', 'transcript_included', 'terminal_packet_sha256',
    'failure_subcode',
] as const;
export const TERMINAL_PACKET_CORE_FIELDS = [
    'contract_id', 'schedule_id', 'task_id', 'root_task_id', 'effect_id',
    'target_thread_id', 'originating_turn_id', 'requested_model_selector',
    'requested_reasoning', 'actual_identity', 'actual_identity_attestation_sha256',
    'outcome', 'terminal_state', 'terminal_result_projection_sha256',
    'artifacts_sha256', 'tests_sha256', 'terminal_manifest_sha256',
    'protected_effects',
] as const;
export const TERMINAL_PACKET_FIELDS = [...TERMINAL_PACKET_CORE_FIELDS, 'terminal_packet_sha256'] as const;

type RecordValue = Record<string, unknown>;
export class TerminalObservationSchemaError extends Error {
    readonly code = 'SCHEMA_INVALID' as const;
    constructor(message: string) { super(message); this.name = 'TerminalObservationSchemaError'; }
}
function isRecord(value: unknown): value is RecordValue { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function json(value: unknown, fields?: readonly string[]): string {
    if (value === null) return 'null';
    if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new TerminalObservationSchemaError('canonical_non_finite_number');
        return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (typeof value === 'undefined') throw new TerminalObservationSchemaError('canonical_undefined');
    if (Array.isArray(value)) return '[' + value.map((entry) => json(entry)).join(',') + ']';
    if (!isRecord(value)) throw new TerminalObservationSchemaError('canonical_unsupported_type');
    const keys = fields ? fields.filter((key) => Object.hasOwn(value, key)) : Object.keys(value).sort();
    if (fields) for (const key of Object.keys(value)) if (!fields.includes(key)) throw new TerminalObservationSchemaError('unknown_field:' + key);
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + json(value[key])).join(',') + '}';
}
export function canonicalSerialize(fields: readonly string[], value: unknown): string {
    if (!isRecord(value)) throw new TerminalObservationSchemaError('record_required');
    const actual = Object.keys(value).sort(), expected = [...fields].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TerminalObservationSchemaError('field_set_mismatch');
    return json(value, fields);
}
export function sha256Utf8(value: string): string { return createHash('sha256').update(Buffer.from(value, 'utf8')).digest('hex'); }
export function hashCanonical(fields: readonly string[], value: unknown): string { return sha256Utf8(canonicalSerialize(fields, value)); }
export function hashGeneric(value: unknown): string { return sha256Utf8(json(value)); }
export function assertHash(value: unknown): asserts value is string {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new TerminalObservationSchemaError('sha256_required');
}
function nonEmpty(value: unknown, field: string): asserts value is string {
    if (typeof value !== 'string' || value.length === 0) throw new TerminalObservationSchemaError(field + '_required');
}
function nonNegativeInteger(value: unknown, field: string): asserts value is number {
    if (!Number.isInteger(value) || (value as number) < 0) throw new TerminalObservationSchemaError(field + '_invalid');
}
function identity(actual: unknown, attestation: unknown): void {
    nonEmpty(actual, 'actual_identity');
    if (actual === ACTUAL_IDENTITY_UNREPORTED) {
        if (attestation !== null) throw new TerminalObservationSchemaError('unreported_identity_must_not_claim_attestation');
    } else assertHash(attestation);
}
function exact<T extends object>(fields: readonly string[], value: T): T {
    canonicalSerialize(fields, value);
    return value;
}

export interface SendAck {
    request_id: string; target_thread_id: string; request_target_thread_id: string;
    returned_thread_id: string; returned_turn_id: string; send_idempotency_key: string;
    canonical_cwd_sha256: string; message_sha256: string; message_bytes: number;
    requested_model_selector: string; requested_reasoning: ReasoningLevel;
    actual_identity: string; actual_identity_attestation_sha256: string | null;
    host_id: string; send_requested_wall_time: string | number; send_ack_wall_time: string | number;
    send_ack_monotonic_ms: number; send_result_projection_sha256: string;
    send_receipt_sha256: string;
}
export type SendAckInput = Omit<SendAck, 'send_receipt_sha256'>;
export function createSendAck(input: SendAckInput): SendAck {
    exact(SEND_ACK_CORE_FIELDS, input);
    nonEmpty(input.request_id, 'request_id'); nonEmpty(input.target_thread_id, 'target_thread_id');
    nonEmpty(input.request_target_thread_id, 'request_target_thread_id'); nonEmpty(input.returned_thread_id, 'returned_thread_id');
    nonEmpty(input.returned_turn_id, 'returned_turn_id'); nonEmpty(input.send_idempotency_key, 'send_idempotency_key');
    if (input.target_thread_id !== input.request_target_thread_id || input.target_thread_id !== input.returned_thread_id) throw new TerminalObservationSchemaError('send_target_thread_conflict');
    assertHash(input.canonical_cwd_sha256); assertHash(input.message_sha256); assertHash(input.send_result_projection_sha256);
    if (!Number.isInteger(input.message_bytes) || input.message_bytes < 0) throw new TerminalObservationSchemaError('message_bytes_invalid');
    if (!['minimal', 'low', 'medium', 'high', 'max'].includes(input.requested_reasoning)) throw new TerminalObservationSchemaError('requested_reasoning_invalid');
    identity(input.actual_identity, input.actual_identity_attestation_sha256); nonEmpty(input.host_id, 'host_id');
    nonNegativeInteger(input.send_ack_monotonic_ms, 'send_ack_monotonic_ms');
    const send_receipt_sha256 = hashCanonical(SEND_ACK_CORE_FIELDS, input);
    return { ...input, send_receipt_sha256 };
}
export function assertSendAck(value: unknown): asserts value is SendAck {
    if (!isRecord(value)) throw new TerminalObservationSchemaError('send_ack_record_required');
    exact(SEND_ACK_FIELDS, value);
    const core = { ...value } as Record<string, unknown>; delete core.send_receipt_sha256;
    createSendAck(core as SendAckInput);
    if ((value as unknown as SendAck).send_receipt_sha256 !== hashCanonical(SEND_ACK_CORE_FIELDS, core)) throw new TerminalObservationSchemaError('send_receipt_hash_mismatch');
}

export interface ScheduleCore {
    contract_id: string; task_id: string; root_task_id: string; effect_id: string; idempotency_key: string;
    target_thread_id: string; returned_turn_id: string; send_receipt_sha256: string;
    send_ack_monotonic_ms: number; hard_lease_ms: number; observation_1_offset_ms: number;
    observation_2_offset_ms: number; observation_grace_ms: number; max_direct_reads: number;
}
export interface ObservationSchedule extends ScheduleCore {
    schedule_id: string; ack_id: string; read_1_due_ms: number; read_1_close_ms: number;
    read_2_due_ms: number; read_2_close_ms: number; schedule_receipt_sha256: string;
}
export function createObservationSchedule(input: Omit<ScheduleCore, 'contract_id' | 'hard_lease_ms' | 'observation_1_offset_ms' | 'observation_2_offset_ms' | 'observation_grace_ms' | 'max_direct_reads'>): ObservationSchedule {
    const core: ScheduleCore = {
        contract_id: CONTRACT_ID, ...input,
        hard_lease_ms: WAIT_SCHEDULE_PROFILE.hard_lease_ms,
        observation_1_offset_ms: WAIT_SCHEDULE_PROFILE.observation_1_offset_ms,
        observation_2_offset_ms: WAIT_SCHEDULE_PROFILE.observation_2_offset_ms,
        observation_grace_ms: WAIT_SCHEDULE_PROFILE.observation_grace_ms,
        max_direct_reads: WAIT_SCHEDULE_PROFILE.max_direct_reads,
    };
    exact(SCHEDULE_CORE_FIELDS, core); nonEmpty(core.task_id, 'task_id'); nonEmpty(core.root_task_id, 'root_task_id');
    nonEmpty(core.effect_id, 'effect_id'); nonEmpty(core.idempotency_key, 'idempotency_key'); nonEmpty(core.target_thread_id, 'target_thread_id');
    nonEmpty(core.returned_turn_id, 'returned_turn_id'); assertHash(core.send_receipt_sha256); nonNegativeInteger(core.send_ack_monotonic_ms, 'send_ack_monotonic_ms');
    const digest = hashCanonical(SCHEDULE_CORE_FIELDS, core);
    const schedule: ObservationSchedule = {
        ...core, schedule_id: 'observation:' + digest, ack_id: 'wait-schedule:' + digest,
        read_1_due_ms: core.send_ack_monotonic_ms + core.observation_1_offset_ms,
        read_1_close_ms: core.send_ack_monotonic_ms + core.observation_1_offset_ms + core.observation_grace_ms,
        read_2_due_ms: core.send_ack_monotonic_ms + core.observation_2_offset_ms,
        read_2_close_ms: core.send_ack_monotonic_ms + core.observation_2_offset_ms + core.observation_grace_ms,
        schedule_receipt_sha256: '',
    };
    const receiptCore = Object.fromEntries(SCHEDULE_RECEIPT_FIELDS.map((key) => [key, schedule[key]]));
    schedule.schedule_receipt_sha256 = hashCanonical(SCHEDULE_RECEIPT_FIELDS, receiptCore);
    return schedule;
}
export function assertObservationSchedule(value: unknown): asserts value is ObservationSchedule {
    if (!isRecord(value)) throw new TerminalObservationSchemaError('schedule_record_required');
    exact([...SCHEDULE_RECEIPT_FIELDS, 'schedule_receipt_sha256'], value);
    const core = Object.fromEntries(SCHEDULE_CORE_FIELDS.map((key) => [key, value[key]])) as unknown as ScheduleCore;
    const expected = createObservationSchedule(core);
    if (canonicalSerialize([...SCHEDULE_RECEIPT_FIELDS, 'schedule_receipt_sha256'], value) !== canonicalSerialize([...SCHEDULE_RECEIPT_FIELDS, 'schedule_receipt_sha256'], expected)) throw new TerminalObservationSchemaError('schedule_binding_mismatch');
}
export function initialObservationCursor(schedule: ObservationSchedule): string {
    return 'obs:' + hashCanonical(['schedule_id', 'target_thread_id', 'returned_turn_id', 'send_receipt_sha256'], {
        schedule_id: schedule.schedule_id, target_thread_id: schedule.target_thread_id,
        returned_turn_id: schedule.returned_turn_id, send_receipt_sha256: schedule.send_receipt_sha256,
    });
}
export function nextObservationCursor(cursorBefore: string, observationIndex: number, readRequestSha256: string, readReceiptSha256: string): string {
    nonEmpty(cursorBefore, 'cursor_before'); nonNegativeInteger(observationIndex, 'observation_index'); assertHash(readRequestSha256); assertHash(readReceiptSha256);
    return 'obs:' + hashCanonical(['cursor_before', 'observation_index', 'read_request_sha256', 'read_receipt_sha256'], { cursor_before: cursorBefore, observation_index: observationIndex, read_request_sha256: readRequestSha256, read_receipt_sha256: readReceiptSha256 });
}

export type ThreadStatus = 'TERMINAL' | 'NONTERMINAL' | 'UNAVAILABLE' | 'UNKNOWN';
export type TerminalProjectionStatus = 'STRUCTURED' | 'NONTERMINAL' | 'UNAVAILABLE' | 'MALFORMED' | 'TRANSCRIPT_ONLY';
export type TerminalOutcome = 'DELIVERED_UNVERIFIED' | 'REJECTED' | 'UNKNOWN';
export type TerminalState = 'TERMINAL' | 'REJECTED' | 'UNKNOWN';
export interface TerminalPacketCore {
    contract_id: string; schedule_id: string; task_id: string; root_task_id: string; effect_id: string;
    target_thread_id: string; originating_turn_id: string; requested_model_selector: string;
    requested_reasoning: ReasoningLevel; actual_identity: string; actual_identity_attestation_sha256: string | null;
    outcome: TerminalOutcome; terminal_state: TerminalState; terminal_result_projection_sha256: string;
    artifacts_sha256: string; tests_sha256: string; terminal_manifest_sha256: string; protected_effects: number;
}
export interface TerminalPacket extends TerminalPacketCore { terminal_packet_sha256: string; }
export interface TerminalPacketInput extends Omit<TerminalPacketCore, 'contract_id' | 'terminal_result_projection_sha256'> { terminal_result_projection: unknown; }
export function createTerminalPacket(input: TerminalPacketInput): TerminalPacket {
    const core: TerminalPacketCore = { contract_id: CONTRACT_ID, ...input, terminal_result_projection_sha256: hashGeneric(input.terminal_result_projection) } as TerminalPacketCore;
    delete (core as unknown as Record<string, unknown>).terminal_result_projection;
    exact(TERMINAL_PACKET_CORE_FIELDS, core); nonEmpty(core.schedule_id, 'schedule_id'); nonEmpty(core.task_id, 'task_id');
    nonEmpty(core.root_task_id, 'root_task_id'); nonEmpty(core.effect_id, 'effect_id'); nonEmpty(core.target_thread_id, 'target_thread_id');
    nonEmpty(core.originating_turn_id, 'originating_turn_id'); nonEmpty(core.requested_model_selector, 'requested_model_selector');
    if (!['minimal', 'low', 'medium', 'high', 'max'].includes(core.requested_reasoning)) throw new TerminalObservationSchemaError('requested_reasoning_invalid');
    identity(core.actual_identity, core.actual_identity_attestation_sha256); assertHash(core.terminal_result_projection_sha256);
    assertHash(core.artifacts_sha256); assertHash(core.tests_sha256); assertHash(core.terminal_manifest_sha256);
    if (!['DELIVERED_UNVERIFIED', 'REJECTED', 'UNKNOWN'].includes(core.outcome)) throw new TerminalObservationSchemaError('terminal_outcome_invalid');
    if (!['TERMINAL', 'REJECTED', 'UNKNOWN'].includes(core.terminal_state)) throw new TerminalObservationSchemaError('terminal_state_invalid');
    if (!Number.isInteger(core.protected_effects) || core.protected_effects < 0) throw new TerminalObservationSchemaError('protected_effects_invalid');
    return { ...core, terminal_packet_sha256: hashCanonical(TERMINAL_PACKET_CORE_FIELDS, core) };
}
export function assertTerminalPacket(value: unknown): asserts value is TerminalPacket {
    if (!isRecord(value)) throw new TerminalObservationSchemaError('terminal_packet_record_required');
    exact(TERMINAL_PACKET_FIELDS, value); const core = { ...value } as Record<string, unknown>; delete core.terminal_packet_sha256;
    exact(TERMINAL_PACKET_CORE_FIELDS, core); assertHash(value.terminal_packet_sha256);
    if (value.terminal_packet_sha256 !== hashCanonical(TERMINAL_PACKET_CORE_FIELDS, core)) throw new TerminalObservationSchemaError('terminal_packet_hash_mismatch');
    identity(value.actual_identity, value.actual_identity_attestation_sha256); assertHash(value.terminal_result_projection_sha256);
    assertHash(value.artifacts_sha256); assertHash(value.tests_sha256); assertHash(value.terminal_manifest_sha256);
}

export type HostCursorStatus = 'returned' | 'unavailable';
export interface ObservationRow {
    contract_id: string; schedule_id: string; task_id: string; root_task_id: string; effect_id: string;
    observation_index: number; target_thread_id: string; expected_turn_id: string; returned_thread_id: string | null;
    returned_turn_id: string | null; requested_at_monotonic_ms: number; observed_at_monotonic_ms: number;
    due_at_monotonic_ms: number; close_at_monotonic_ms: number; elapsed_since_send_ms: number; within_window: boolean;
    host_cursor: string | null; host_cursor_status: HostCursorStatus; thread_status: ThreadStatus;
    terminal_projection_status: TerminalProjectionStatus; read_request_sha256: string; read_result_projection_sha256: string | null;
    read_receipt_sha256: string | null; cursor_before: string; cursor_after: string | null; transcript_included: false;
    terminal_packet_sha256: string | null; failure_subcode: FailureSubcode | null;
}
export function assertObservationRow(value: unknown): asserts value is ObservationRow {
    if (!isRecord(value)) throw new TerminalObservationSchemaError('observation_row_required');
    const row = value as unknown as ObservationRow;
    exact(OBSERVATION_FIELDS, row); nonEmpty(row.schedule_id, 'schedule_id'); nonEmpty(row.task_id, 'task_id');
    nonEmpty(row.root_task_id, 'root_task_id'); nonEmpty(row.effect_id, 'effect_id'); nonNegativeInteger(row.observation_index, 'observation_index');
    nonEmpty(row.target_thread_id, 'target_thread_id'); nonEmpty(row.expected_turn_id, 'expected_turn_id');
    nonNegativeInteger(row.requested_at_monotonic_ms, 'requested_at_monotonic_ms'); nonNegativeInteger(row.observed_at_monotonic_ms, 'observed_at_monotonic_ms');
    nonNegativeInteger(row.due_at_monotonic_ms, 'due_at_monotonic_ms'); nonNegativeInteger(row.close_at_monotonic_ms, 'close_at_monotonic_ms');
    if (typeof row.within_window !== 'boolean' || row.transcript_included !== false) throw new TerminalObservationSchemaError('observation_negative_proof_invalid');
    if (row.host_cursor_status === 'returned') nonEmpty(row.host_cursor, 'host_cursor');
    if (!['returned', 'unavailable'].includes(row.host_cursor_status)) throw new TerminalObservationSchemaError('host_cursor_status_invalid');
    if (!['TERMINAL', 'NONTERMINAL', 'UNAVAILABLE', 'UNKNOWN'].includes(row.thread_status)) throw new TerminalObservationSchemaError('thread_status_invalid');
    if (!['STRUCTURED', 'NONTERMINAL', 'UNAVAILABLE', 'MALFORMED', 'TRANSCRIPT_ONLY'].includes(row.terminal_projection_status)) throw new TerminalObservationSchemaError('terminal_projection_status_invalid');
    assertHash(row.read_request_sha256); if (row.read_result_projection_sha256 !== null) assertHash(row.read_result_projection_sha256);
    if (row.read_receipt_sha256 !== null) assertHash(row.read_receipt_sha256); if (row.terminal_packet_sha256 !== null) assertHash(row.terminal_packet_sha256);
    if (row.failure_subcode !== null && !FAILURE_SUBCODES.includes(row.failure_subcode as FailureSubcode)) throw new TerminalObservationSchemaError('failure_subcode_invalid');
}

export const ADAPTER_METRIC_FIELDS = [
    'native_send_calls', 'send_ack_count', 'native_wait_calls', 'direct_read_calls', 'interval_poll_calls',
    'dispatches', 'duplicate_dispatches', 'retries', 'replays', 'replacements', 'fallbacks', 'descendants',
    'peer_messages', 'terminal_packet_count', 'unknown_count', 'transcript_authority', 'protected_effects',
    'provider_calls', 'forge_calls', 'enm_e01_calls', 'acceptance_credit',
] as const;
export interface AdapterMetrics { [key: string]: number; }
export function createAdapterMetrics(): AdapterMetrics {
    return Object.fromEntries(ADAPTER_METRIC_FIELDS.map((field) => [field, 0]));
}
export function assertNegativeMetrics(metrics: AdapterMetrics): void {
    for (const field of ['native_wait_calls', 'interval_poll_calls', 'duplicate_dispatches', 'retries', 'replays', 'replacements', 'fallbacks', 'descendants', 'peer_messages', 'transcript_authority', 'protected_effects', 'provider_calls', 'forge_calls', 'enm_e01_calls', 'acceptance_credit']) if (metrics[field] !== 0) throw new TerminalObservationSchemaError('negative_metric_nonzero:' + field);
}

export const CONTRACT_MANIFEST = Object.freeze({
    contract_id: CONTRACT_ID, schema_version: SCHEMA_VERSION, plan_version: PLAN_VERSION,
    encoding: UTF8_ENCODING, effect_order: EFFECT_ORDER, schedule_profile: WAIT_SCHEDULE_PROFILE,
    schedule_core_fields: SCHEDULE_CORE_FIELDS, send_ack_fields: SEND_ACK_FIELDS,
    observation_fields: OBSERVATION_FIELDS, terminal_packet_fields: TERMINAL_PACKET_FIELDS,
    failure_subcodes: FAILURE_SUBCODES, actual_identity_without_attestation: ACTUAL_IDENTITY_UNREPORTED,
    transcript_authority: 0, forge: 'TOMBSTONED_PERMANENT',
});
const MANIFEST_FIELDS = ['contract_id', 'schema_version', 'plan_version', 'encoding', 'effect_order', 'schedule_profile', 'schedule_core_fields', 'send_ack_fields', 'observation_fields', 'terminal_packet_fields', 'failure_subcodes', 'actual_identity_without_attestation', 'transcript_authority', 'forge'] as const;
export const CANONICAL_MANIFEST_SERIALIZATION = json(CONTRACT_MANIFEST, MANIFEST_FIELDS);
export const CANONICAL_MANIFEST_SHA256 = sha256Utf8(CANONICAL_MANIFEST_SERIALIZATION);
export const CANONICAL_CONTRACT_SHA256 = sha256Utf8(json({ contract_id: CONTRACT_ID, schema_version: SCHEMA_VERSION, manifest_sha256: CANONICAL_MANIFEST_SHA256 }, ['contract_id', 'schema_version', 'manifest_sha256']));
