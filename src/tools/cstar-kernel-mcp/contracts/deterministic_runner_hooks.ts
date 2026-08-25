import { createHash } from 'node:crypto';

export const CONTRACT_ID = 'cso-d004-s01-deterministic-runner-hooks-v1';
export const SCHEMA_VERSION = 'cso-d004-s01.schema.v1';
export const REDUCER_VERSION = 'cso-d004-s01.reducer.v1';
export const UTF8_ENCODING = 'UTF-8';
export const ACTUAL_IDENTITY_UNREPORTED = 'unreported';
export const TRANSPORT_EFFECTS = ['TASK_CREATE', 'TASK_RESUME', 'TASK_FORK', 'TASK_SEND', 'TASK_WAIT', 'TASK_READ'] as const;
export type TransportEffect = typeof TRANSPORT_EFFECTS[number];
export const LIFECYCLE_PHASES = ['PLANNED', 'CREATE_PENDING', 'CREATED', 'RESUME_PENDING', 'RESUMED', 'FORK_PENDING', 'FORKED', 'SEND_PENDING', 'SENT', 'WAIT_PENDING', 'WAITED', 'READ_PENDING', 'READ', 'TERMINAL', 'VALIDATED', 'RECOVERY', 'UNKNOWN', 'REJECTED'] as const;
export type LifecyclePhase = typeof LIFECYCLE_PHASES[number];
export const EFFECT_ORDER = [
    { sequence: 0, effect: 'TASK_CREATE', from_phase: 'PLANNED', pending_phase: 'CREATE_PENDING', ack_phase: 'CREATED' },
    { sequence: 1, effect: 'TASK_RESUME', from_phase: 'CREATED', pending_phase: 'RESUME_PENDING', ack_phase: 'RESUMED' },
    { sequence: 2, effect: 'TASK_FORK', from_phase: 'RESUMED', pending_phase: 'FORK_PENDING', ack_phase: 'FORKED' },
    { sequence: 3, effect: 'TASK_SEND', from_phase: 'FORKED', pending_phase: 'SEND_PENDING', ack_phase: 'SENT' },
    { sequence: 4, effect: 'TASK_WAIT', from_phase: 'SENT', pending_phase: 'WAIT_PENDING', ack_phase: 'WAITED' },
    { sequence: 5, effect: 'TASK_READ', from_phase: 'WAITED', pending_phase: 'READ_PENDING', ack_phase: 'READ' },
] as const;
export const CRASH_BOUNDARIES = ['before_outbox_append', 'after_outbox_append_before_transport', 'during_transport', 'after_transport_before_ack_persist', 'after_ack_persist_before_snapshot', 'during_recovery'] as const;
export type CrashBoundary = typeof CRASH_BOUNDARIES[number];
export const FAILURE_CODES = ['SCHEMA_INVALID', 'CAS_MISMATCH', 'EFFECT_ORDER_VIOLATION', 'INVALID_PHASE_TRANSITION', 'IDEMPOTENCY_CONFLICT', 'DUPLICATE_EXTERNAL_EFFECT_FORBIDDEN', 'UNKNOWN_POST_EFFECT', 'RECOVERY_REQUIRED', 'RETRY_FORBIDDEN', 'TERMINAL_REQUIRED', 'VALIDATION_REQUIRED', 'TRANSPORT_REJECTED', 'FORGE_REACHABILITY_FORBIDDEN', 'MODEL_SELECTED_LIFECYCLE_FORBIDDEN', 'TRANSCRIPT_AUTHORITY_FORBIDDEN', 'POLLING_FORBIDDEN', 'SILENT_RETRY_FORBIDDEN'] as const;
export type FailureCode = typeof FAILURE_CODES[number];

export const SCHEMA_FIELDS = {
    contract_binding: ['contract_id', 'schema_version', 'reducer_version', 'manifest_sha256'],
    contract_manifest: ['contract_id', 'schema_version', 'reducer_version', 'encoding', 'canonicalization', 'schema_fields', 'lifecycle_phases', 'effect_order', 'transport_effects', 'identity_policy', 'retry_policy', 'crash_boundaries', 'failure_codes', 'negative_proofs', 'forge_policy'],
    schema_manifest_entry: ['schema_name', 'fields'], effect_order_entry: ['sequence', 'effect', 'from_phase', 'pending_phase', 'ack_phase'],
    identity_policy: ['requested_model_selector_field', 'requested_reasoning_field', 'actual_identity_field', 'attestation_field', 'missing_attestation_value', 'model_authority', 'transcript_authority'],
    retry_policy: ['default_retry', 'max_retry', 'silent_retry', 'uncertain_post_effect'],
    negative_proofs: ['forge_reachability', 'model_selected_lifecycle', 'transcript_authority', 'polling', 'silent_retries', 'duplicate_external_effects'],
    forge_policy: ['status', 'reachable', 'route'],
    request: ['contract_id', 'schema_version', 'task_id', 'root_task_id', 'scope', 'expected_revision', 'requested_model_selector', 'requested_reasoning', 'actual_identity', 'actual_identity_attestation_sha256', 'retry_budget', 'retry_count'],
    effect_derivation: ['contract_id', 'task_id', 'sequence', 'effect', 'payload_sha256'],
    effect_intent: ['effect_id', 'idempotency_key', 'sequence', 'effect', 'payload_sha256', 'expected_revision', 'retry_count'],
    journal_event: ['sequence', 'revision', 'phase_before', 'phase_after', 'operation', 'effect_id', 'idempotency_key'],
    journal: ['sequence', 'revision', 'phase_before', 'phase_after', 'operation', 'effect_id', 'idempotency_key', 'event_sha256'],
    snapshot: ['task_id', 'revision', 'phase', 'next_effect_sequence', 'journal_sha256', 'outbox_sha256', 'inbox_sha256', 'metrics_sha256', 'state_sha256'],
    outbox: ['effect_id', 'idempotency_key', 'sequence', 'effect', 'payload_sha256', 'status', 'created_revision', 'updated_revision'],
    inbox: ['effect_id', 'idempotency_key', 'status', 'ack_id', 'result_sha256', 'observed_revision', 'received_revision'],
    ack: ['effect_id', 'idempotency_key', 'ack_id', 'observed_revision', 'response_sha256'],
    terminal: ['phase', 'reason', 'terminal_sha256', 'revision'], terminal_core: ['phase', 'reason', 'revision'],
    validation_input: ['validator_id', 'validator_kind', 'result', 'evidence_sha256'],
    validation: ['validator_id', 'validator_kind', 'result', 'evidence_sha256', 'validated_revision'],
    recovery_decision: ['observed_status', 'recovery_action', 'required_operator_decision'],
    recovery: ['effect_id', 'boundary', 'observed_status', 'recovery_action', 'required_operator_decision', 'recovery_sha256', 'revision'],
    recovery_core: ['effect_id', 'boundary', 'observed_status', 'recovery_action', 'required_operator_decision', 'revision'],
    metrics: ['effects_planned', 'effects_acknowledged', 'effects_unknown', 'effects_failed', 'duplicate_intent_attempts', 'retry_attempts', 'poll_attempts', 'forge_reachability', 'model_selected_lifecycle', 'transcript_authority', 'external_effects_executed', 'duplicate_external_effects', 'cas_mismatches', 'terminal_transitions', 'validation_passes', 'validation_failures', 'recovery_transitions'],
    checkpoint_identity: ['task_id', 'revision', 'phase', 'snapshot_sha256'],
    checkpoint: ['checkpoint_id', 'task_id', 'revision', 'phase', 'snapshot_sha256', 'journal_sha256', 'outbox_sha256', 'inbox_sha256', 'metrics_sha256'],
    transport_result: ['effect_id', 'idempotency_key', 'status', 'ack_id', 'observed_revision', 'boundary', 'failure_code', 'response_sha256'],
    state_core: ['contract_id', 'schema_version', 'task_id', 'root_task_id', 'scope', 'revision', 'last_cas_expected_revision', 'phase', 'next_effect_sequence', 'requested_model_selector', 'requested_reasoning', 'actual_identity', 'actual_identity_attestation_sha256', 'retry_budget', 'retry_count', 'journal', 'outbox', 'inbox', 'ack', 'terminal', 'validation', 'recovery', 'metrics'],
} as const;
export type SchemaName = keyof typeof SCHEMA_FIELDS;
type FieldOrderSpec = { fields?: readonly string[]; children?: Readonly<Record<string, FieldOrderSpec>>; array_item?: FieldOrderSpec };

const SCHEMA_SPECS: Partial<Record<SchemaName, FieldOrderSpec>> = {};
for (const name of Object.keys(SCHEMA_FIELDS) as SchemaName[]) SCHEMA_SPECS[name] = { fields: SCHEMA_FIELDS[name] };
SCHEMA_SPECS.contract_manifest = { fields: SCHEMA_FIELDS.contract_manifest, children: { schema_fields: { array_item: { fields: SCHEMA_FIELDS.schema_manifest_entry } }, effect_order: { array_item: { fields: SCHEMA_FIELDS.effect_order_entry } }, identity_policy: { fields: SCHEMA_FIELDS.identity_policy }, retry_policy: { fields: SCHEMA_FIELDS.retry_policy }, negative_proofs: { fields: SCHEMA_FIELDS.negative_proofs }, forge_policy: { fields: SCHEMA_FIELDS.forge_policy } } };
SCHEMA_SPECS.state_core = { fields: SCHEMA_FIELDS.state_core, children: { journal: { array_item: { fields: SCHEMA_FIELDS.journal } }, outbox: { array_item: { fields: SCHEMA_FIELDS.outbox } }, inbox: { array_item: { fields: SCHEMA_FIELDS.inbox } }, ack: { fields: SCHEMA_FIELDS.ack }, terminal: { fields: SCHEMA_FIELDS.terminal }, validation: { fields: SCHEMA_FIELDS.validation }, recovery: { fields: SCHEMA_FIELDS.recovery }, metrics: { fields: SCHEMA_FIELDS.metrics } } };

function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export class ContractSchemaError extends Error { readonly code = 'SCHEMA_INVALID' as const; constructor(message: string) { super(message); this.name = 'ContractSchemaError'; } }
function specFor(name: SchemaName): FieldOrderSpec { const spec = SCHEMA_SPECS[name]; if (!spec) throw new ContractSchemaError('schema_spec_missing:' + name); return spec; }
function canonicalJson(value: unknown, spec?: FieldOrderSpec): string {
    if (value === null) return 'null';
    if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number') { if (!Number.isFinite(value)) throw new ContractSchemaError('canonical_non_finite_number'); return JSON.stringify(Object.is(value, -0) ? 0 : value); }
    if (typeof value === 'undefined') throw new ContractSchemaError('canonical_undefined');
    if (typeof value !== 'object') throw new ContractSchemaError('canonical_unsupported_type');
    if (Array.isArray(value)) return '[' + value.map((entry) => canonicalJson(entry, spec?.array_item)).join(',') + ']';
    const record = value as Record<string, unknown>;
    const keys = spec?.fields ? spec.fields.filter((key) => Object.hasOwn(record, key)) : Object.keys(record).sort();
    if (spec?.fields) for (const key of Object.keys(record)) if (!spec.fields.includes(key)) throw new ContractSchemaError('unknown_field:' + key);
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonicalJson(record[key], spec?.children?.[key])).join(',') + '}';
}
export function assertSchema(name: SchemaName, value: unknown): asserts value is Record<string, unknown> {
    if (!isRecord(value)) throw new ContractSchemaError(name + '_must_be_object');
    const expected = [...SCHEMA_FIELDS[name]].sort(), actual = Object.keys(value).sort();
    if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) throw new ContractSchemaError(name + '_field_set_mismatch');
    canonicalJson(value, specFor(name));
}
export function canonicalSerialize(name: SchemaName, value: unknown): string { assertSchema(name, value); return canonicalJson(value, specFor(name)); }
export function sha256Utf8(text: string): string { return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex'); }
export function hashCanonical(name: SchemaName, value: unknown): string { return sha256Utf8(canonicalSerialize(name, value)); }
function hashGeneric(value: unknown): string { return sha256Utf8(canonicalJson(value)); }
function hashCollection(name: SchemaName, values: readonly unknown[]): string { return sha256Utf8(canonicalJson(values, { array_item: specFor(name) })); }

export const FORGE_POLICY = Object.freeze({ status: 'TOMBSTONED_PERMANENT', reachable: false, route: 'none' });
export const CONTRACT_MANIFEST = Object.freeze({
    contract_id: CONTRACT_ID, schema_version: SCHEMA_VERSION, reducer_version: REDUCER_VERSION, encoding: UTF8_ENCODING,
    canonicalization: 'schema field order, no whitespace, UTF-8 SHA-256',
    schema_fields: (Object.keys(SCHEMA_FIELDS) as SchemaName[]).map((schema_name) => ({ schema_name, fields: [...SCHEMA_FIELDS[schema_name]] })),
    lifecycle_phases: [...LIFECYCLE_PHASES], effect_order: [...EFFECT_ORDER], transport_effects: [...TRANSPORT_EFFECTS],
    identity_policy: { requested_model_selector_field: 'requested_model_selector', requested_reasoning_field: 'requested_reasoning', actual_identity_field: 'actual_identity', attestation_field: 'actual_identity_attestation_sha256', missing_attestation_value: ACTUAL_IDENTITY_UNREPORTED, model_authority: 'requested fields are evidence only; reducer selection is closed and static', transcript_authority: 'transcripts are never lifecycle authority' },
    retry_policy: { default_retry: 0, max_retry: 0, silent_retry: 'forbidden', uncertain_post_effect: 'UNKNOWN then RECOVERY; no replay' },
    crash_boundaries: [...CRASH_BOUNDARIES], failure_codes: [...FAILURE_CODES],
    negative_proofs: { forge_reachability: 0, model_selected_lifecycle: 0, transcript_authority: 0, polling: 0, silent_retries: 0, duplicate_external_effects: 0 },
    forge_policy: FORGE_POLICY,
});
export const CANONICAL_MANIFEST_SERIALIZATION = canonicalSerialize('contract_manifest', CONTRACT_MANIFEST);
export const CANONICAL_MANIFEST_SHA256 = sha256Utf8(CANONICAL_MANIFEST_SERIALIZATION);
export const CANONICAL_CONTRACT_SHA256 = hashCanonical('contract_binding', { contract_id: CONTRACT_ID, schema_version: SCHEMA_VERSION, reducer_version: REDUCER_VERSION, manifest_sha256: CANONICAL_MANIFEST_SHA256 });

export type ReasoningLevel = 'minimal' | 'low' | 'medium' | 'high' | 'max';
export interface RunnerRequest { contract_id: string; schema_version: string; task_id: string; root_task_id: string; scope: string; expected_revision: number; requested_model_selector: string; requested_reasoning: ReasoningLevel; actual_identity: string; actual_identity_attestation_sha256: string | null; retry_budget: number; retry_count: number; }
export type RunnerRequestInput = Omit<RunnerRequest, 'contract_id' | 'schema_version' | 'expected_revision' | 'actual_identity' | 'actual_identity_attestation_sha256' | 'retry_budget' | 'retry_count'> & Partial<Pick<RunnerRequest, 'expected_revision' | 'actual_identity' | 'actual_identity_attestation_sha256' | 'retry_budget' | 'retry_count'>>;
function assertHash(value: unknown, nullable = false): void { if (nullable && value === null) return; if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new ContractSchemaError('sha256_required'); }
export function assertRunnerRequest(request: RunnerRequest): void {
    assertSchema('request', request);
    if (request.contract_id !== CONTRACT_ID || request.schema_version !== SCHEMA_VERSION) throw new ContractSchemaError('request_contract_binding_mismatch');
    for (const key of ['task_id', 'root_task_id', 'scope', 'requested_model_selector'] as const) if (typeof request[key] !== 'string' || !request[key]) throw new ContractSchemaError('request_' + key + '_required');
    if (!Number.isInteger(request.expected_revision) || request.expected_revision < 0) throw new ContractSchemaError('request_revision_invalid');
    if (!['minimal', 'low', 'medium', 'high', 'max'].includes(request.requested_reasoning)) throw new ContractSchemaError('request_reasoning_invalid');
    if (typeof request.actual_identity !== 'string' || !request.actual_identity) throw new ContractSchemaError('request_actual_identity_required');
    if (request.actual_identity === ACTUAL_IDENTITY_UNREPORTED) { if (request.actual_identity_attestation_sha256 !== null) throw new ContractSchemaError('unreported_identity_must_not_claim_attestation'); } else assertHash(request.actual_identity_attestation_sha256);
    if (!Number.isInteger(request.retry_budget) || request.retry_budget !== 0 || request.retry_count !== 0) throw new ContractSchemaError('retry_zero_required');
}
export function createRunnerRequest(input: RunnerRequestInput): RunnerRequest {
    const request: RunnerRequest = { contract_id: CONTRACT_ID, schema_version: SCHEMA_VERSION, task_id: input.task_id, root_task_id: input.root_task_id ?? input.task_id, scope: input.scope, expected_revision: input.expected_revision ?? 0, requested_model_selector: input.requested_model_selector, requested_reasoning: input.requested_reasoning, actual_identity: input.actual_identity ?? ACTUAL_IDENTITY_UNREPORTED, actual_identity_attestation_sha256: input.actual_identity_attestation_sha256 ?? null, retry_budget: input.retry_budget ?? 0, retry_count: input.retry_count ?? 0 };
    assertRunnerRequest(request); return request;
}
export function hashRunnerRequest(request: RunnerRequest): string { assertRunnerRequest(request); return hashCanonical('request', request); }

export interface EffectDerivationInput { task_id: string; sequence: number; effect: TransportEffect; payload: unknown; }
export interface EffectIdentity { effect_id: string; idempotency_key: string; payload_sha256: string; }
export function deriveEffectIdentity(input: EffectDerivationInput): EffectIdentity {
    const order = EFFECT_ORDER[input.sequence]; if (!order || order.effect !== input.effect) throw new ContractSchemaError('effect_order_invalid');
    const payload_sha256 = hashGeneric(input.payload), digest = hashCanonical('effect_derivation', { contract_id: CONTRACT_ID, task_id: input.task_id, sequence: input.sequence, effect: input.effect, payload_sha256 });
    return { effect_id: 'effect:' + digest, idempotency_key: 'idem:' + digest, payload_sha256 };
}
export interface EffectIntent { effect_id: string; idempotency_key: string; sequence: number; effect: TransportEffect; payload_sha256: string; expected_revision: number; retry_count: number; }
export type OutboxStatus = 'PENDING' | 'ACKED' | 'FAILED' | 'UNKNOWN';
export type InboxStatus = 'ACK' | 'FAILURE' | 'UNKNOWN';
export interface JournalEntry { sequence: number; revision: number; phase_before: LifecyclePhase; phase_after: LifecyclePhase; operation: string; effect_id: string | null; idempotency_key: string | null; event_sha256: string; }
export interface OutboxEntry extends EffectIdentity { sequence: number; effect: TransportEffect; status: OutboxStatus; created_revision: number; updated_revision: number; }
export interface InboxEntry { effect_id: string; idempotency_key: string; status: InboxStatus; ack_id: string | null; result_sha256: string; observed_revision: number | null; received_revision: number; }
export interface AckRecord { effect_id: string; idempotency_key: string; ack_id: string; observed_revision: number; response_sha256: string | null; }
export interface TerminalRecord { phase: 'TERMINAL' | 'REJECTED'; reason: string; terminal_sha256: string; revision: number; }
export type ValidationResult = 'PASS' | 'FAIL'; export type ValidatorKind = 'independent' | 'self_check';
export interface ValidationInput { validator_id: string; validator_kind: ValidatorKind; result: ValidationResult; evidence_sha256: string; }
export interface ValidationRecord extends ValidationInput { validated_revision: number; }
export type RecoveryObservedStatus = 'ACK' | 'NOT_SENT' | 'UNKNOWN'; export type RecoveryAction = 'HOLD' | 'RECONCILE';
export interface RecoveryDecision { observed_status: RecoveryObservedStatus; recovery_action: RecoveryAction; required_operator_decision: string; }
export interface RecoveryRecord extends RecoveryDecision { effect_id: string; boundary: CrashBoundary; recovery_sha256: string; revision: number; }
export interface Metrics { effects_planned: number; effects_acknowledged: number; effects_unknown: number; effects_failed: number; duplicate_intent_attempts: number; retry_attempts: number; poll_attempts: number; forge_reachability: number; model_selected_lifecycle: number; transcript_authority: number; external_effects_executed: number; duplicate_external_effects: number; cas_mismatches: number; terminal_transitions: number; validation_passes: number; validation_failures: number; recovery_transitions: number; }
export interface Snapshot { task_id: string; revision: number; phase: LifecyclePhase; next_effect_sequence: number; journal_sha256: string; outbox_sha256: string; inbox_sha256: string; metrics_sha256: string; state_sha256: string; }
export interface Checkpoint { checkpoint_id: string; task_id: string; revision: number; phase: LifecyclePhase; snapshot_sha256: string; journal_sha256: string; outbox_sha256: string; inbox_sha256: string; metrics_sha256: string; }
export type TransportResultStatus = 'ACK' | 'FAILURE' | 'UNKNOWN';
export interface TransportResult { effect_id: string; idempotency_key: string; status: TransportResultStatus; ack_id: string | null; observed_revision: number | null; boundary: CrashBoundary | null; failure_code: 'TRANSPORT_REJECTED' | 'UNKNOWN_POST_EFFECT' | null; response_sha256: string | null; }
export interface RunnerState { contract_id: string; schema_version: string; task_id: string; root_task_id: string; scope: string; revision: number; last_cas_expected_revision: number; phase: LifecyclePhase; next_effect_sequence: number; requested_model_selector: string; requested_reasoning: ReasoningLevel; actual_identity: string; actual_identity_attestation_sha256: string | null; retry_budget: number; retry_count: number; journal: JournalEntry[]; snapshot: Snapshot; outbox: OutboxEntry[]; inbox: InboxEntry[]; ack: AckRecord | null; terminal: TerminalRecord | null; validation: ValidationRecord | null; recovery: RecoveryRecord | null; metrics: Metrics; checkpoint: Checkpoint; }
export interface RunnerFailure { code: FailureCode; message: string; revision: number; effect_id: string | null; }
export type ReducerOutcome = 'OK' | 'IDEMPOTENT_REPLAY' | 'UNKNOWN' | 'REJECTED';
export interface ReducerResult { outcome: ReducerOutcome; state: RunnerState; intent: EffectIntent | null; failure: RunnerFailure | null; metrics_delta: Partial<Metrics>; }

export function createInitialMetrics(): Metrics { return { effects_planned: 0, effects_acknowledged: 0, effects_unknown: 0, effects_failed: 0, duplicate_intent_attempts: 0, retry_attempts: 0, poll_attempts: 0, forge_reachability: 0, model_selected_lifecycle: 0, transcript_authority: 0, external_effects_executed: 0, duplicate_external_effects: 0, cas_mismatches: 0, terminal_transitions: 0, validation_passes: 0, validation_failures: 0, recovery_transitions: 0 }; }
function stateCore(state: RunnerState): Record<string, unknown> { return { contract_id: state.contract_id, schema_version: state.schema_version, task_id: state.task_id, root_task_id: state.root_task_id, scope: state.scope, revision: state.revision, last_cas_expected_revision: state.last_cas_expected_revision, phase: state.phase, next_effect_sequence: state.next_effect_sequence, requested_model_selector: state.requested_model_selector, requested_reasoning: state.requested_reasoning, actual_identity: state.actual_identity, actual_identity_attestation_sha256: state.actual_identity_attestation_sha256, retry_budget: state.retry_budget, retry_count: state.retry_count, journal: state.journal, outbox: state.outbox, inbox: state.inbox, ack: state.ack, terminal: state.terminal, validation: state.validation, recovery: state.recovery, metrics: state.metrics }; }
function journalEntry(sequence: number, revision: number, before: LifecyclePhase, after: LifecyclePhase, operation: string, effect_id: string | null, idempotency_key: string | null): JournalEntry { const core = { sequence, revision, phase_before: before, phase_after: after, operation, effect_id, idempotency_key }; return { ...core, event_sha256: hashCanonical('journal_event', core) }; }
export function buildSnapshot(state: RunnerState): Snapshot { return { task_id: state.task_id, revision: state.revision, phase: state.phase, next_effect_sequence: state.next_effect_sequence, journal_sha256: hashCollection('journal', state.journal), outbox_sha256: hashCollection('outbox', state.outbox), inbox_sha256: hashCollection('inbox', state.inbox), metrics_sha256: hashCanonical('metrics', state.metrics), state_sha256: hashCanonical('state_core', stateCore(state)) }; }
export function buildCheckpoint(state: RunnerState): Checkpoint { const snapshot = state.snapshot ?? buildSnapshot(state), identity = { task_id: state.task_id, revision: state.revision, phase: state.phase, snapshot_sha256: snapshot.state_sha256 }; return { checkpoint_id: 'checkpoint:' + hashCanonical('checkpoint_identity', identity), task_id: state.task_id, revision: state.revision, phase: state.phase, snapshot_sha256: snapshot.state_sha256, journal_sha256: snapshot.journal_sha256, outbox_sha256: snapshot.outbox_sha256, inbox_sha256: snapshot.inbox_sha256, metrics_sha256: snapshot.metrics_sha256 }; }
function refreshDerived(state: RunnerState): RunnerState { const snapshot = buildSnapshot(state), withSnapshot = { ...state, snapshot }; return { ...withSnapshot, checkpoint: buildCheckpoint(withSnapshot) }; }
export function createRunnerState(request: RunnerRequest): RunnerState {
    assertRunnerRequest(request);
    const state = { contract_id: request.contract_id, schema_version: request.schema_version, task_id: request.task_id, root_task_id: request.root_task_id, scope: request.scope, revision: request.expected_revision, last_cas_expected_revision: request.expected_revision, phase: 'PLANNED' as const, next_effect_sequence: 0, requested_model_selector: request.requested_model_selector, requested_reasoning: request.requested_reasoning, actual_identity: request.actual_identity, actual_identity_attestation_sha256: request.actual_identity_attestation_sha256, retry_budget: request.retry_budget, retry_count: request.retry_count, journal: [], snapshot: {} as Snapshot, outbox: [], inbox: [], ack: null, terminal: null, validation: null, recovery: null, metrics: createInitialMetrics(), checkpoint: {} as Checkpoint };
    return refreshDerived(state);
}
export function assertRunnerStateSchema(state: RunnerState): void {
    assertSchema('state_core', stateCore(state)); assertSchema('snapshot', state.snapshot); assertSchema('checkpoint', state.checkpoint);
    state.journal.forEach((entry) => assertSchema('journal', entry)); state.outbox.forEach((entry) => assertSchema('outbox', entry)); state.inbox.forEach((entry) => assertSchema('inbox', entry));
    if (state.ack) assertSchema('ack', state.ack); if (state.terminal) assertSchema('terminal', state.terminal); if (state.validation) assertSchema('validation', state.validation); if (state.recovery) assertSchema('recovery', state.recovery);
    if (!LIFECYCLE_PHASES.includes(state.phase) || !Number.isInteger(state.revision) || state.revision < 0 || !Number.isInteger(state.next_effect_sequence) || state.next_effect_sequence < 0 || state.next_effect_sequence > EFFECT_ORDER.length) throw new ContractSchemaError('state_phase_or_revision_invalid');
    if (state.retry_budget !== 0 || state.retry_count !== 0) throw new ContractSchemaError('state_retry_zero_required');
}
function failure(code: FailureCode, message: string, state: RunnerState, effect_id: string | null = null): RunnerFailure { return { code, message, revision: state.revision, effect_id }; }
function rejected(state: RunnerState, item: RunnerFailure, metrics_delta: Partial<Metrics> = {}): ReducerResult { return { outcome: 'REJECTED', state, intent: null, failure: item, metrics_delta }; }
function ok(state: RunnerState, intent: EffectIntent | null = null): ReducerResult { return { outcome: 'OK', state, intent, failure: null, metrics_delta: {} }; }
function replay(state: RunnerState, intent: EffectIntent): ReducerResult { return { outcome: 'IDEMPOTENT_REPLAY', state, intent, failure: null, metrics_delta: {} }; }
function casFailure(state: RunnerState, expectedRevision: number, effect_id: string | null = null): ReducerResult { return rejected(state, failure('CAS_MISMATCH', 'expected_revision=' + expectedRevision + ', actual_revision=' + state.revision, state, effect_id), { cas_mismatches: 1 }); }
function pendingIntent(state: RunnerState, entry: OutboxEntry): EffectIntent { return { effect_id: entry.effect_id, idempotency_key: entry.idempotency_key, sequence: entry.sequence, effect: entry.effect, payload_sha256: entry.payload_sha256, expected_revision: entry.created_revision - 1, retry_count: state.retry_count }; }

export function queueNextEffect(state: RunnerState, expectedRevision: number, payload: unknown = null): ReducerResult {
    try {
        assertRunnerStateSchema(state); if (expectedRevision !== state.revision) return casFailure(state, expectedRevision);
        const order = EFFECT_ORDER[state.next_effect_sequence]; if (!order) return rejected(state, failure('TERMINAL_REQUIRED', 'all six effects are already acknowledged', state));
        if (state.phase === 'UNKNOWN' || state.phase === 'RECOVERY') return rejected(state, failure('RECOVERY_REQUIRED', 'UNKNOWN and RECOVERY states require reconciliation', state));
        const identity = deriveEffectIdentity({ task_id: state.task_id, sequence: order.sequence, effect: order.effect, payload }), existing = state.outbox.find((entry) => entry.effect_id === identity.effect_id);
        if (state.phase === order.pending_phase && existing) {
            if (existing.payload_sha256 !== identity.payload_sha256) return rejected(state, failure('IDEMPOTENCY_CONFLICT', 'same effect_id received a different payload', state, identity.effect_id), { duplicate_intent_attempts: 1 });
            return replay(state, pendingIntent(state, existing));
        }
        if (state.phase !== order.from_phase) return rejected(state, failure('EFFECT_ORDER_VIOLATION', 'phase=' + state.phase + ' expected=' + order.from_phase, state));
        if (state.retry_budget !== 0 || state.retry_count !== 0) return rejected(state, failure('RETRY_FORBIDDEN', 'retry budget is frozen at zero', state));
        const revision = state.revision + 1, outboxEntry: OutboxEntry = { ...identity, sequence: order.sequence, effect: order.effect, status: 'PENDING', created_revision: revision, updated_revision: revision };
        const next: RunnerState = { ...state, revision, last_cas_expected_revision: expectedRevision, phase: order.pending_phase, outbox: [...state.outbox, outboxEntry], journal: [...state.journal, journalEntry(state.journal.length, revision, state.phase, order.pending_phase, 'OUTBOX_APPEND', identity.effect_id, identity.idempotency_key)], metrics: { ...state.metrics, effects_planned: state.metrics.effects_planned + 1 } };
        return ok(refreshDerived(next), pendingIntent(next, outboxEntry));
    } catch (error) { return rejected(state, failure('SCHEMA_INVALID', error instanceof Error ? error.message : 'schema_error', state)); }
}

function parseTransportResult(input: unknown): TransportResult {
    assertSchema('transport_result', input); const result = input as unknown as TransportResult;
    if (!result.effect_id || !result.idempotency_key || !['ACK', 'FAILURE', 'UNKNOWN'].includes(result.status)) throw new ContractSchemaError('transport_identity_or_status_invalid');
    if (result.observed_revision !== null && (!Number.isInteger(result.observed_revision) || result.observed_revision < 0)) throw new ContractSchemaError('transport_observed_revision_invalid');
    if (result.response_sha256 !== null) assertHash(result.response_sha256);
    if (result.status === 'ACK' && (!result.ack_id || result.boundary !== null || result.failure_code !== null)) throw new ContractSchemaError('ack_shape_invalid');
    if (result.status === 'FAILURE' && (result.ack_id !== null || result.boundary !== null || result.failure_code !== 'TRANSPORT_REJECTED')) throw new ContractSchemaError('failure_shape_invalid');
    if (result.status === 'UNKNOWN' && (result.ack_id !== null || !result.boundary || result.failure_code !== 'UNKNOWN_POST_EFFECT')) throw new ContractSchemaError('unknown_shape_invalid');
    return result;
}
export function applyTransportResult(state: RunnerState, expectedRevision: number, input: unknown): ReducerResult {
    let result: TransportResult;
    try { assertRunnerStateSchema(state); result = parseTransportResult(input); } catch (error) { return rejected(state, failure('SCHEMA_INVALID', error instanceof Error ? error.message : 'schema_error', state)); }
    const result_sha256 = hashCanonical('transport_result', result), existingInbox = state.inbox.find((entry) => entry.effect_id === result.effect_id);
    if (existingInbox) {
        if (existingInbox.result_sha256 === result_sha256) {
            const existingOutbox = state.outbox.find((entry) => entry.effect_id === result.effect_id);
            return replay(state, existingOutbox ? pendingIntent(state, existingOutbox) : { effect_id: result.effect_id, idempotency_key: result.idempotency_key, sequence: -1, effect: 'TASK_READ', payload_sha256: '', expected_revision: state.revision, retry_count: state.retry_count });
        }
        return rejected(state, failure('IDEMPOTENCY_CONFLICT', 'effect result changed after inbox persistence', state, result.effect_id), { duplicate_intent_attempts: 1 });
    }
    if (expectedRevision !== state.revision) return casFailure(state, expectedRevision, result.effect_id);
    const outboxEntry = state.outbox.find((entry) => entry.effect_id === result.effect_id);
    if (!outboxEntry) return rejected(state, failure('EFFECT_ORDER_VIOLATION', 'result has no outbox intent', state, result.effect_id));
    if (outboxEntry.idempotency_key !== result.idempotency_key) return rejected(state, failure('IDEMPOTENCY_CONFLICT', 'idempotency key does not match outbox', state, result.effect_id), { duplicate_intent_attempts: 1 });
    const order = EFFECT_ORDER[outboxEntry.sequence]; if (state.phase !== order.pending_phase) return rejected(state, failure('EFFECT_ORDER_VIOLATION', 'result phase=' + state.phase, state, result.effect_id));
    const revision = state.revision + 1, inbox: InboxEntry = { effect_id: result.effect_id, idempotency_key: result.idempotency_key, status: result.status === 'ACK' ? 'ACK' : result.status === 'FAILURE' ? 'FAILURE' : 'UNKNOWN', ack_id: result.ack_id, result_sha256, observed_revision: result.observed_revision, received_revision: revision };
    const updatedOutbox: OutboxEntry = { ...outboxEntry, status: result.status === 'ACK' ? 'ACKED' : result.status === 'FAILURE' ? 'FAILED' : 'UNKNOWN', updated_revision: revision };
    const common = { ...state, revision, last_cas_expected_revision: expectedRevision, outbox: state.outbox.map((entry) => entry.effect_id === result.effect_id ? updatedOutbox : entry), inbox: [...state.inbox, inbox] };
    if (result.status === 'UNKNOWN') {
        const core = { effect_id: result.effect_id, boundary: result.boundary as CrashBoundary, observed_status: 'UNKNOWN' as const, recovery_action: 'HOLD' as const, required_operator_decision: 'RECONCILE', revision };
        const recovery: RecoveryRecord = { ...core, recovery_sha256: hashCanonical('recovery_core', core) };
        const next: RunnerState = { ...common, phase: 'UNKNOWN', recovery, journal: [...state.journal, journalEntry(state.journal.length, revision, state.phase, 'UNKNOWN', 'UNKNOWN_PERSIST', result.effect_id, result.idempotency_key)], metrics: { ...state.metrics, effects_unknown: state.metrics.effects_unknown + 1 } }, final = refreshDerived(next);
        return { outcome: 'UNKNOWN', state: final, intent: pendingIntent(final, updatedOutbox), failure: failure('UNKNOWN_POST_EFFECT', 'post-effect state is uncertain at ' + result.boundary, final, result.effect_id), metrics_delta: {} };
    }
    if (result.status === 'FAILURE') {
        const core = { phase: 'REJECTED' as const, reason: 'transport_rejected', revision }, next: RunnerState = { ...common, phase: 'REJECTED', terminal: { ...core, terminal_sha256: hashCanonical('terminal_core', core) }, journal: [...state.journal, journalEntry(state.journal.length, revision, state.phase, 'REJECTED', 'FAILURE_PERSIST', result.effect_id, result.idempotency_key)], metrics: { ...state.metrics, effects_failed: state.metrics.effects_failed + 1 } };
        return { outcome: 'REJECTED', state: refreshDerived(next), intent: null, failure: failure('TRANSPORT_REJECTED', 'transport rejected the effect', next, result.effect_id), metrics_delta: {} };
    }
    const ack: AckRecord = { effect_id: result.effect_id, idempotency_key: result.idempotency_key, ack_id: result.ack_id as string, observed_revision: result.observed_revision ?? revision, response_sha256: result.response_sha256 };
    const next: RunnerState = { ...common, phase: order.ack_phase, next_effect_sequence: state.next_effect_sequence + 1, ack, journal: [...state.journal, journalEntry(state.journal.length, revision, state.phase, order.ack_phase, 'ACK_PERSIST', result.effect_id, result.idempotency_key)], metrics: { ...state.metrics, effects_acknowledged: state.metrics.effects_acknowledged + 1 } };
    return ok(refreshDerived(next), { effect_id: result.effect_id, idempotency_key: result.idempotency_key, sequence: outboxEntry.sequence, effect: outboxEntry.effect, payload_sha256: outboxEntry.payload_sha256, expected_revision: expectedRevision, retry_count: state.retry_count });
}

export function markTerminal(state: RunnerState, expectedRevision: number, reason: string): ReducerResult {
    try {
        assertRunnerStateSchema(state); if (expectedRevision !== state.revision) return casFailure(state, expectedRevision);
        if (state.phase !== 'READ' || state.next_effect_sequence !== EFFECT_ORDER.length) return rejected(state, failure('TERMINAL_REQUIRED', 'terminal transition requires READ after all six ACKs', state));
        if (!reason) return rejected(state, failure('SCHEMA_INVALID', 'terminal reason is required', state));
        const revision = state.revision + 1, core = { phase: 'TERMINAL' as const, reason, revision }, next: RunnerState = { ...state, revision, last_cas_expected_revision: expectedRevision, phase: 'TERMINAL', terminal: { ...core, terminal_sha256: hashCanonical('terminal_core', core) }, journal: [...state.journal, journalEntry(state.journal.length, revision, state.phase, 'TERMINAL', 'TERMINAL_PERSIST', null, null)], metrics: { ...state.metrics, terminal_transitions: state.metrics.terminal_transitions + 1 } };
        return ok(refreshDerived(next));
    } catch (error) { return rejected(state, failure('SCHEMA_INVALID', error instanceof Error ? error.message : 'schema_error', state)); }
}
export function recordValidation(state: RunnerState, expectedRevision: number, input: unknown): ReducerResult {
    try {
        assertRunnerStateSchema(state); assertSchema('validation_input', input); const validationInput = input as unknown as ValidationInput;
        assertHash(validationInput.evidence_sha256); if (!validationInput.validator_id || !['independent', 'self_check'].includes(validationInput.validator_kind) || !['PASS', 'FAIL'].includes(validationInput.result)) throw new ContractSchemaError('validation_shape_invalid');
        if (expectedRevision !== state.revision) return casFailure(state, expectedRevision); if (state.phase !== 'TERMINAL' || !state.terminal) return rejected(state, failure('VALIDATION_REQUIRED', 'validation requires a terminal state', state));
        const revision = state.revision + 1, nextPhase = validationInput.result === 'PASS' ? 'VALIDATED' : 'REJECTED', validation: ValidationRecord = { ...validationInput, validated_revision: revision }, next: RunnerState = { ...state, revision, last_cas_expected_revision: expectedRevision, phase: nextPhase, terminal: validationInput.result === 'FAIL' ? { ...state.terminal, phase: 'REJECTED' } : state.terminal, validation, journal: [...state.journal, journalEntry(state.journal.length, revision, state.phase, nextPhase, 'VALIDATION_PERSIST', null, null)], metrics: { ...state.metrics, validation_passes: state.metrics.validation_passes + (validationInput.result === 'PASS' ? 1 : 0), validation_failures: state.metrics.validation_failures + (validationInput.result === 'FAIL' ? 1 : 0) } };
        return ok(refreshDerived(next));
    } catch (error) { return rejected(state, failure('SCHEMA_INVALID', error instanceof Error ? error.message : 'schema_error', state)); }
}
export function recoverUnknown(state: RunnerState, expectedRevision: number, input: unknown): ReducerResult {
    try {
        assertRunnerStateSchema(state); assertSchema('recovery_decision', input); const decision = input as unknown as RecoveryDecision;
        if (!['ACK', 'NOT_SENT', 'UNKNOWN'].includes(decision.observed_status) || !['HOLD', 'RECONCILE'].includes(decision.recovery_action) || !decision.required_operator_decision) throw new ContractSchemaError('recovery_decision_invalid');
        if (expectedRevision !== state.revision) return casFailure(state, expectedRevision); if (state.phase !== 'UNKNOWN' || !state.recovery) return rejected(state, failure('RECOVERY_REQUIRED', 'recovery requires an UNKNOWN state', state));
        const revision = state.revision + 1, core: RecoveryRecord = { effect_id: state.recovery.effect_id, boundary: state.recovery.boundary, observed_status: decision.observed_status, recovery_action: decision.recovery_action, required_operator_decision: decision.required_operator_decision, recovery_sha256: '', revision };
        core.recovery_sha256 = hashCanonical('recovery_core', { effect_id: core.effect_id, boundary: core.boundary, observed_status: core.observed_status, recovery_action: core.recovery_action, required_operator_decision: core.required_operator_decision, revision });
        const next: RunnerState = { ...state, revision, last_cas_expected_revision: expectedRevision, phase: 'RECOVERY', recovery: core, journal: [...state.journal, journalEntry(state.journal.length, revision, state.phase, 'RECOVERY', 'RECOVERY_PERSIST', core.effect_id, state.outbox[state.outbox.length - 1]?.idempotency_key ?? null)], metrics: { ...state.metrics, recovery_transitions: state.metrics.recovery_transitions + 1 } };
        return ok(refreshDerived(next));
    } catch (error) { return rejected(state, failure('SCHEMA_INVALID', error instanceof Error ? error.message : 'schema_error', state)); }
}

export type ForbiddenOperation = 'FORGE_REACHABILITY' | 'MODEL_SELECTED_LIFECYCLE' | 'TRANSCRIPT_AUTHORITY' | 'POLLING' | 'SILENT_RETRY' | 'DUPLICATE_EXTERNAL_EFFECT';
export function rejectForbiddenOperation(operation: ForbiddenOperation, state?: RunnerState): RunnerFailure {
    const code: Record<ForbiddenOperation, FailureCode> = { FORGE_REACHABILITY: 'FORGE_REACHABILITY_FORBIDDEN', MODEL_SELECTED_LIFECYCLE: 'MODEL_SELECTED_LIFECYCLE_FORBIDDEN', TRANSCRIPT_AUTHORITY: 'TRANSCRIPT_AUTHORITY_FORBIDDEN', POLLING: 'POLLING_FORBIDDEN', SILENT_RETRY: 'SILENT_RETRY_FORBIDDEN', DUPLICATE_EXTERNAL_EFFECT: 'DUPLICATE_EXTERNAL_EFFECT_FORBIDDEN' };
    return { code: code[operation], message: operation + ' is outside the closed contract', revision: state?.revision ?? 0, effect_id: null };
}
export function buildNegativeProofs(metrics: Metrics) { return { forge_reachability: metrics.forge_reachability, model_selected_lifecycle: metrics.model_selected_lifecycle, transcript_authority: metrics.transcript_authority, polling: metrics.poll_attempts, silent_retries: metrics.retry_attempts, duplicate_external_effects: metrics.duplicate_external_effects }; }
export function assertNegativeProofs(metrics: Metrics): void { if (Object.values(buildNegativeProofs(metrics)).some((value) => value !== 0)) throw new ContractSchemaError('negative_proof_nonzero'); }
