import { canonicalSha256, hashOmittingField, isPlainJsonObject, withSelfHash } from "./canonical.js";
import {
  assertSetRecord,
  SET_SCHEMA,
  type SetRecord,
  type SetRecordInput,
  validatePackagePathList,
} from "./work_packets.js";

export { SET_SCHEMA, createSetRecord, makeSetRecord, bindSetRecord, verifySetRecord, validateSetRecord, assertSetRecord } from "./work_packets.js";
export type { SetRecord, SetRecordInput } from "./work_packets.js";

export const OUTBOX_SCHEMA = "corvus.effect_outbox.v1" as const;
export const INBOX_SCHEMA = "corvus.effect_inbox.v1" as const;
export const EFFECT_STATE_SCHEMA = "corvus.effect_state.v1" as const;
export const PROJECT_CONTROLLER_DISPATCH = "PROJECT_CONTROLLER_DISPATCH" as const;
export type EffectKind = typeof PROJECT_CONTROLLER_DISPATCH;
export type TransportStatus = "ACK" | "FAILURE" | "UNKNOWN";

export interface EffectOutboxRecord {
  readonly schema: typeof OUTBOX_SCHEMA;
  readonly effect_id: string;
  readonly idempotency_key: string;
  readonly set_id: string;
  readonly cell_id: string;
  readonly sequence: number;
  readonly effect_kind: EffectKind;
  readonly controller_generation: string;
  readonly payload_sha256: string;
  readonly input_manifest_sha256: string;
  readonly output_allowlist_sha256: string;
  readonly capability_profile_hash: string;
  readonly lease: unknown;
  readonly expected_state_revision: number;
  readonly status: "RESERVED" | "ACKED" | "FAILED" | "UNKNOWN";
  readonly created_revision: number;
}

export interface EffectInboxRecord {
  readonly schema: typeof INBOX_SCHEMA;
  readonly effect_id: string;
  readonly idempotency_key: string;
  readonly transport_status: TransportStatus;
  readonly host_task_id: string | null;
  readonly host_turn_id: string | null;
  readonly returned_thread_id: string | null;
  readonly returned_turn_id: string | null;
  readonly requested_model: string;
  readonly requested_reasoning: string;
  readonly actual_identity: string;
  readonly result_sha256: string | null;
  readonly observed_state_revision: number;
  readonly received_at_measured: unknown;
  readonly failure_code: string | null;
  readonly inbox_sha256: string;
}

export interface EffectState {
  readonly schema: typeof EFFECT_STATE_SCHEMA;
  readonly revision: number;
  readonly set_record: SetRecord;
  readonly outbox: readonly EffectOutboxRecord[];
  readonly inbox: readonly EffectInboxRecord[];
}

export interface ReservationInput {
  readonly state: EffectState;
  readonly set_id?: string;
  readonly cell_id: string;
  readonly effect_kind?: EffectKind;
  readonly action?: unknown;
  readonly payload: unknown;
  readonly sequence?: number;
  readonly input_manifest?: unknown;
  readonly input_manifest_sha256?: string;
  readonly output_allowlist?: unknown;
  readonly output_allowlist_sha256?: string;
  readonly capability_profile_hash?: string;
  readonly lease?: unknown;
  readonly expected_state_revision?: number;
  readonly idempotency_key?: string;
  readonly scope?: string;
  readonly controller_generation?: string;
  readonly requested_model?: string;
  readonly requested_reasoning?: string;
}

export interface ReservationResult {
  readonly state: EffectState;
  readonly effect: EffectOutboxRecord;
  readonly replayed: boolean;
  readonly effect_id: string;
  readonly idempotency_key: string;
  readonly identity_sha256: string;
}

export interface InboxObservationInput {
  readonly set_id?: string;
  readonly effect_id: string;
  readonly idempotency_key: string;
  readonly transport_status: TransportStatus;
  readonly host_task_id?: string | null;
  readonly host_turn_id?: string | null;
  readonly returned_thread_id?: string | null;
  readonly returned_turn_id?: string | null;
  readonly requested_model?: string;
  readonly requested_reasoning?: string;
  readonly actual_identity?: string;
  readonly result?: unknown;
  readonly result_sha256?: string | null;
  readonly observed_state_revision?: number;
  readonly received_at_measured?: unknown;
  readonly failure_code?: string | null;
  readonly scope?: string;
  readonly controller_generation?: string;
}

export interface InboxResult {
  readonly state: EffectState;
  readonly inbox: EffectInboxRecord;
  readonly replayed: boolean;
}

export type EffectErrorCode =
  | "INVALID_SET" | "INVALID_STATE" | "INVALID_EFFECT" | "INVALID_INBOX"
  | "IDEMPOTENCY_CONFLICT" | "DUPLICATE_CONFLICT" | "UNRESERVED_INBOX"
  | "CROSS_SET" | "CROSS_SCOPE" | "STALE_REVISION" | "SKIPPED_REVISION"
  | "STALE_GENERATION" | "INVALID_EFFECT_KIND";

export class EffectError extends Error {
  readonly code: EffectErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: EffectErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "EffectError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

const SHA256 = /^[0-9a-f]{64}$/u;
const OUTBOX_KEYS = [
  "schema", "effect_id", "idempotency_key", "set_id", "cell_id", "sequence", "effect_kind",
  "controller_generation", "payload_sha256", "input_manifest_sha256", "output_allowlist_sha256",
  "capability_profile_hash", "lease", "expected_state_revision", "status", "created_revision",
] as const;
const INBOX_KEYS = [
  "schema", "effect_id", "idempotency_key", "transport_status", "host_task_id", "host_turn_id",
  "returned_thread_id", "returned_turn_id", "requested_model", "requested_reasoning", "actual_identity",
  "result_sha256", "observed_state_revision", "received_at_measured", "failure_code", "inbox_sha256",
] as const;
const STATE_KEYS = ["schema", "revision", "set_record", "outbox", "inbox"] as const;
const INBOX_INPUT_KEYS = new Set([
  "set_id", "effect_id", "idempotency_key", "transport_status", "host_task_id", "host_turn_id", "returned_thread_id",
  "returned_turn_id", "requested_model", "requested_reasoning", "actual_identity", "result", "result_sha256",
  "observed_state_revision", "received_at_measured", "failure_code", "scope", "controller_generation",
]);
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "authority", "operator_grant", "operator-grant", "transcript", "callback",
  "lifecycle", "lifecycle_authority", "lifecycle-authority", "lifecycle_state", "lifecycle_transition",
  "lifecycle_event", "lifecycle_status", "controller", "controller_generation", "set_id", "bead_id",
  "effect_id", "idempotency_key", "state_revision", "revision", "event_type", "terminal", "terminal_packet",
  "acceptance", "validation_result",
]);

function record(value: unknown): value is Record<string, unknown> { return isPlainJsonObject(value); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function string(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function hash(value: unknown): value is string { return typeof value === "string" && SHA256.test(value); }
function canonical(value: unknown, label: string): string {
  try { return canonicalSha256(value); } catch (error) {
    throw new EffectError("INVALID_EFFECT", `${label} is not canonical JSON`, { cause: String(error) });
  }
}
function arrays(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
function forbiddenPayloadKey(key: string): boolean {
  return FORBIDDEN_PAYLOAD_KEYS.has(key) || key.startsWith("lifecycle_") || key.startsWith("operator_grant")
    || key.endsWith("_authority");
}
function containsForbiddenPayloadKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenPayloadKey);
  if (!record(value)) return false;
  return Object.entries(value).some(([key, child]) => forbiddenPayloadKey(key) || containsForbiddenPayloadKey(child));
}

function validOutbox(value: unknown): value is EffectOutboxRecord {
  if (!record(value) || !exactKeys(value, OUTBOX_KEYS) || value.schema !== OUTBOX_SCHEMA) return false;
  return string(value.effect_id) && string(value.idempotency_key) && string(value.set_id)
    && string(value.cell_id) && Number.isSafeInteger(value.sequence) && value.sequence > 0
    && value.effect_kind === PROJECT_CONTROLLER_DISPATCH && string(value.controller_generation)
    && hash(value.payload_sha256) && hash(value.input_manifest_sha256) && hash(value.output_allowlist_sha256)
    && hash(value.capability_profile_hash) && canonical(value.lease, "outbox lease") !== ""
    && Number.isSafeInteger(value.expected_state_revision) && value.expected_state_revision >= 0
    && ["RESERVED", "ACKED", "FAILED", "UNKNOWN"].includes(String(value.status))
    && Number.isSafeInteger(value.created_revision)
    && value.created_revision === value.expected_state_revision + 1;
}

export function verifyOutboxRecord(value: unknown): value is EffectOutboxRecord { try { return validOutbox(value); } catch { return false; } }
export const validateOutboxRecord = verifyOutboxRecord;
export function assertOutboxRecord(value: unknown): asserts value is EffectOutboxRecord {
  if (!verifyOutboxRecord(value)) throw new EffectError("INVALID_EFFECT", "Outbox record is invalid");
}

function validInbox(value: unknown): value is EffectInboxRecord {
  if (!record(value) || !exactKeys(value, INBOX_KEYS) || value.schema !== INBOX_SCHEMA) return false;
  const ids = [value.host_task_id, value.host_turn_id, value.returned_thread_id, value.returned_turn_id];
  return string(value.effect_id) && string(value.idempotency_key)
    && ["ACK", "FAILURE", "UNKNOWN"].includes(String(value.transport_status))
    && ids.every((entry) => entry === null || string(entry)) && string(value.requested_model)
    && string(value.requested_reasoning) && string(value.actual_identity)
    && (value.result_sha256 === null || hash(value.result_sha256))
    && Number.isSafeInteger(value.observed_state_revision) && value.observed_state_revision >= 0
    && (value.failure_code === null || string(value.failure_code)) && hash(value.inbox_sha256)
    && canonical(value.received_at_measured, "inbox received_at_measured") !== "";
}
export function verifyInboxRecord(value: unknown): value is EffectInboxRecord {
  try { return validInbox(value) && hashOmittingField(value, "inbox_sha256") === value.inbox_sha256; } catch { return false; }
}
export const validateInboxRecord = verifyInboxRecord;
export function assertInboxRecord(value: unknown): asserts value is EffectInboxRecord {
  if (!verifyInboxRecord(value)) throw new EffectError("INVALID_INBOX", "Inbox record is invalid");
}

function validState(value: unknown): value is EffectState {
  return record(value) && exactKeys(value, STATE_KEYS) && value.schema === EFFECT_STATE_SCHEMA
    && Number.isSafeInteger(value.revision) && value.revision >= 0 && verifySet(value.set_record)
    && Array.isArray(value.outbox) && value.outbox.every(verifyOutboxRecord)
    && Array.isArray(value.inbox) && value.inbox.every(verifyInboxRecord);
}
function verifySet(value: unknown): value is SetRecord {
  try { assertSetRecord(value); return true; } catch { return false; }
}
export function verifyEffectState(value: unknown): value is EffectState {
  if (!validState(value)) return false;
  const ids = value.outbox.map((entry) => entry.effect_id);
  const keys = value.outbox.map((entry) => entry.idempotency_key);
  if (new Set(ids).size !== ids.length || new Set(keys).size !== keys.length) return false;
  return value.outbox.every((effect) => effect.set_id === value.set_record.set_id
    && effect.controller_generation === value.set_record.controller_generation)
    && value.inbox.every((entry) => value.outbox.some((effect) => {
      const expectedStatus = entry.transport_status === "ACK" ? "ACKED"
        : entry.transport_status === "FAILURE" ? "FAILED" : "UNKNOWN";
      return effect.effect_id === entry.effect_id && effect.idempotency_key === entry.idempotency_key
        && effect.status === expectedStatus && entry.observed_state_revision < value.revision;
    }));
}
export const validateEffectState = verifyEffectState;
export function assertEffectState(value: unknown): asserts value is EffectState {
  if (!verifyEffectState(value)) throw new EffectError("INVALID_STATE", "Effect state is invalid");
}
export function createEffectState(setRecord: SetRecord): EffectState {
  assertSetRecord(setRecord);
  return { schema: EFFECT_STATE_SCHEMA, revision: 0, set_record: setRecord, outbox: [], inbox: [] };
}
export const initialEffectState = createEffectState;
export const emptyEffectState = createEffectState;
export const createEffectStore = createEffectState;
export function effectStateSha256(state: EffectState): string { assertEffectState(state); return canonicalSha256(state); }

function manifestHash(value: unknown, supplied: string | undefined, label: string): string {
  if (value !== undefined) {
    if (label === "output allowlist" && !validatePackagePathList(value)) {
      throw new EffectError("INVALID_EFFECT", "Output allowlist paths are invalid");
    }
    if (label === "input manifest" && (!Array.isArray(value) || value.length === 0
      || !value.every((entry) => record(entry) && validatePackagePathList([entry.path], false)))) {
      throw new EffectError("INVALID_EFFECT", "Input manifest paths are invalid");
    }
  }
  const computed = value === undefined ? undefined : canonical(value, label);
  if (supplied !== undefined && (!hash(supplied) || (computed !== undefined && supplied !== computed))) {
    throw new EffectError("INVALID_EFFECT", `${label} hash does not bind bytes`);
  }
  if (supplied !== undefined) return supplied;
  if (computed === undefined) throw new EffectError("INVALID_EFFECT", `${label} bytes or hash are required`);
  return computed;
}
function identity(input: {
  readonly set: SetRecord; readonly cell_id: string; readonly sequence: number;
  readonly effect_kind: EffectKind; readonly payload: unknown; readonly input_manifest_sha256: string;
  readonly output_allowlist_sha256: string; readonly capability_profile_hash: string; readonly lease: unknown;
}): Record<string, unknown> {
  return {
    schema: "corvus.effect_identity.v1", set_sha256: input.set.set_sha256, set_id: input.set.set_id,
    cell_id: input.cell_id, sequence: input.sequence, action: input.effect_kind, effect_kind: input.effect_kind,
    scope: input.set.scope, controller_generation: input.set.controller_generation,
    requested_model: input.set.requested_model, requested_reasoning: input.set.requested_reasoning,
    payload: input.payload, input_manifest_sha256: input.input_manifest_sha256,
    output_allowlist_sha256: input.output_allowlist_sha256,
    capability_profile_hash: input.capability_profile_hash, lease: input.lease,
  };
}
export function deriveEffectIdentity(input: Parameters<typeof identity>[0]) {
  const value = identity(input);
  const identity_sha256 = canonicalSha256(value);
  return {
    identity: value, identity_sha256, effect_id: `effect:${identity_sha256}`,
    idempotency_key: `idempotency:${canonicalSha256({ schema: "corvus.effect_idempotency.v1", identity: value })}`,
  } as const;
}
export const deriveEffectId = (input: Parameters<typeof identity>[0]): string => deriveEffectIdentity(input).effect_id;
export const deriveIdempotencyKey = (input: Parameters<typeof identity>[0]): string => deriveEffectIdentity(input).idempotency_key;

export function reserveEffect(input: ReservationInput): ReservationResult {
  assertEffectState(input.state);
  const set = input.state.set_record;
  const existingByKey = input.idempotency_key === undefined
    ? undefined : input.state.outbox.find((effect) => effect.idempotency_key === input.idempotency_key);
  if (input.set_id !== undefined && input.set_id !== set.set_id) {
    if (existingByKey !== undefined) throw new EffectError("IDEMPOTENCY_CONFLICT", "SET identity conflicts with existing key");
    throw new EffectError("CROSS_SET", "Effect SET does not match the bound SET");
  }
  if (input.scope !== undefined && input.scope !== set.scope) {
    if (existingByKey !== undefined) throw new EffectError("IDEMPOTENCY_CONFLICT", "Scope conflicts with existing key");
    throw new EffectError("CROSS_SCOPE", "Scope mismatch");
  }
  if (input.controller_generation !== undefined && input.controller_generation !== set.controller_generation) {
    if (existingByKey !== undefined) throw new EffectError("IDEMPOTENCY_CONFLICT", "Generation conflicts with existing key");
    throw new EffectError("STALE_GENERATION", "Controller generation mismatch");
  }
  if (input.requested_model !== undefined && input.requested_model !== set.requested_model) {
    if (existingByKey !== undefined) throw new EffectError("IDEMPOTENCY_CONFLICT", "Requested model conflicts with existing key");
    throw new EffectError("IDEMPOTENCY_CONFLICT", "Requested model mismatch");
  }
  if (input.requested_reasoning !== undefined && input.requested_reasoning !== set.requested_reasoning) {
    if (existingByKey !== undefined) throw new EffectError("IDEMPOTENCY_CONFLICT", "Requested reasoning conflicts with existing key");
    throw new EffectError("IDEMPOTENCY_CONFLICT", "Requested reasoning mismatch");
  }
  if (!string(input.cell_id)) throw new EffectError("INVALID_EFFECT", "cell_id is required");
  const kind = input.effect_kind ?? PROJECT_CONTROLLER_DISPATCH;
  if (kind !== PROJECT_CONTROLLER_DISPATCH) throw new EffectError("INVALID_EFFECT_KIND", "Unsupported S02 effect kind");
  if (containsForbiddenPayloadKey(input.payload)) {
    throw new EffectError("INVALID_EFFECT", "Payload contains a forbidden authority or lifecycle field");
  }
  if (input.action !== undefined && input.action !== kind) {
    if (existingByKey !== undefined) throw new EffectError("IDEMPOTENCY_CONFLICT", "Action conflicts with existing key");
    throw new EffectError("INVALID_EFFECT", "Action mismatch");
  }
  const expectedRevision = input.expected_state_revision ?? input.state.revision;
  if (expectedRevision < input.state.revision) throw new EffectError("STALE_REVISION", "Reservation revision is stale");
  if (expectedRevision > input.state.revision) throw new EffectError("SKIPPED_REVISION", "Reservation revision skips state");
  const inputHash = manifestHash(input.input_manifest, input.input_manifest_sha256, "input manifest");
  const outputBytes = input.output_allowlist === undefined && input.output_allowlist_sha256 === undefined
    ? [] : input.output_allowlist;
  const outputHash = manifestHash(outputBytes, input.output_allowlist_sha256, "output allowlist");
  const capability = input.capability_profile_hash ?? set.capability_profile_hash;
  if (!hash(capability)) throw new EffectError("INVALID_EFFECT", "Capability profile hash is invalid");
  const lease = input.lease ?? set.lease;
  canonical(lease, "effect lease");
  const payloadHash = canonicalSha256(input.payload);
  const semanticExisting = input.state.outbox.find((effect) => effect.set_id === set.set_id
    && effect.cell_id === input.cell_id && effect.effect_kind === kind
    && effect.payload_sha256 === payloadHash && effect.input_manifest_sha256 === inputHash
    && effect.output_allowlist_sha256 === outputHash && effect.capability_profile_hash === capability
    && canonicalSha256(effect.lease) === canonicalSha256(lease));
  const sequence = input.sequence ?? semanticExisting?.sequence ?? input.state.outbox.length + 1;
  if (!Number.isSafeInteger(sequence) || sequence <= 0) throw new EffectError("INVALID_EFFECT", "Invalid effect sequence");
  const identityValue = identity({ set, cell_id: input.cell_id, sequence, effect_kind: kind, payload: input.payload,
    input_manifest_sha256: inputHash, output_allowlist_sha256: outputHash,
    capability_profile_hash: capability, lease });
  const identity_sha256 = canonicalSha256(identityValue);
  const effect_id = `effect:${identity_sha256}`;
  const derivedKey = `idempotency:${canonicalSha256({ schema: "corvus.effect_idempotency.v1", identity: identityValue })}`;
  const idempotency_key = input.idempotency_key ?? derivedKey;
  if (!string(idempotency_key)) throw new EffectError("INVALID_EFFECT", "Idempotency key is required");
  const expected = {
    schema: OUTBOX_SCHEMA, effect_id, idempotency_key, set_id: set.set_id, cell_id: input.cell_id, sequence,
    effect_kind: kind, controller_generation: set.controller_generation, payload_sha256: payloadHash,
    input_manifest_sha256: inputHash, output_allowlist_sha256: outputHash, capability_profile_hash: capability,
    lease, expected_state_revision: input.state.revision,
  } as const;
  const existing = input.state.outbox.find((effect) => effect.idempotency_key === idempotency_key
    || effect.effect_id === effect_id);
  if (existing !== undefined) {
    const same = existing.effect_id === expected.effect_id && existing.idempotency_key === expected.idempotency_key
      && existing.set_id === expected.set_id && existing.cell_id === expected.cell_id && existing.sequence === expected.sequence
      && existing.effect_kind === expected.effect_kind && existing.controller_generation === expected.controller_generation
      && existing.payload_sha256 === expected.payload_sha256 && existing.input_manifest_sha256 === expected.input_manifest_sha256
      && existing.output_allowlist_sha256 === expected.output_allowlist_sha256
      && existing.capability_profile_hash === expected.capability_profile_hash
      && canonicalSha256(existing.lease) === canonicalSha256(expected.lease);
    if (!same) throw new EffectError("IDEMPOTENCY_CONFLICT", "Effect reservation conflicts with existing identity");
    return { state: input.state, effect: existing, replayed: true, effect_id: existing.effect_id,
      idempotency_key: existing.idempotency_key, identity_sha256 };
  }
  const effect: EffectOutboxRecord = { ...expected, status: "RESERVED", created_revision: input.state.revision + 1 };
  assertOutboxRecord(effect);
  const state: EffectState = { ...input.state, revision: input.state.revision + 1,
    outbox: [...input.state.outbox, effect] };
  return { state, effect, replayed: false, effect_id, idempotency_key, identity_sha256 };
}
export const reserveOutboxEffect = reserveEffect;
export const reserve = reserveEffect;

export function createInboxRecord(input: InboxObservationInput): EffectInboxRecord {
  if (!record(input) || Object.keys(input).some((key) => !INBOX_INPUT_KEYS.has(key))) {
    throw new EffectError("INVALID_INBOX", "Unknown inbox observation field");
  }
  const resultHash = input.result === undefined ? input.result_sha256 ?? null : canonicalSha256(input.result);
  if (input.result !== undefined && input.result_sha256 !== undefined && input.result_sha256 !== resultHash) {
    throw new EffectError("INVALID_INBOX", "Result hash mismatch");
  }
  if (resultHash !== null && !hash(resultHash)) throw new EffectError("INVALID_INBOX", "Invalid result hash");
  const base = {
    schema: INBOX_SCHEMA, effect_id: input.effect_id, idempotency_key: input.idempotency_key,
    transport_status: input.transport_status, host_task_id: input.host_task_id ?? null,
    host_turn_id: input.host_turn_id ?? null, returned_thread_id: input.returned_thread_id ?? null,
    returned_turn_id: input.returned_turn_id ?? null, requested_model: input.requested_model ?? "unreported",
    requested_reasoning: input.requested_reasoning ?? "unreported", actual_identity: input.actual_identity ?? "unreported",
    result_sha256: resultHash, observed_state_revision: input.observed_state_revision ?? 0,
    received_at_measured: input.received_at_measured ?? "unavailable", failure_code: input.failure_code ?? null,
  };
  const candidate = { ...base, inbox_sha256: "0".repeat(64) };
  if (!validInbox(candidate)) throw new EffectError("INVALID_INBOX", "Inbox fields are invalid");
  return withSelfHash(base, "inbox_sha256") as EffectInboxRecord;
}
export const makeInboxRecord = createInboxRecord;

export function observeInbox(state: EffectState, input: InboxObservationInput): InboxResult {
  assertEffectState(state);
  if (input.set_id !== undefined && input.set_id !== state.set_record.set_id) {
    throw new EffectError("CROSS_SET", "Inbox SET does not match the reserved effect");
  }
  const effect = state.outbox.find((entry) => entry.effect_id === input.effect_id);
  if (effect === undefined) throw new EffectError("UNRESERVED_INBOX", "Effect was not reserved");
  if (input.idempotency_key !== effect.idempotency_key) throw new EffectError("IDEMPOTENCY_CONFLICT", "Inbox key mismatch");
  if (input.scope !== undefined && input.scope !== state.set_record.scope) throw new EffectError("CROSS_SCOPE", "Inbox scope mismatch");
  if (input.controller_generation !== undefined && input.controller_generation !== state.set_record.controller_generation) {
    throw new EffectError("STALE_GENERATION", "Inbox generation mismatch");
  }
  if (input.requested_model !== undefined && input.requested_model !== state.set_record.requested_model) {
    throw new EffectError("IDEMPOTENCY_CONFLICT", "Requested model mismatch");
  }
  if (input.requested_reasoning !== undefined && input.requested_reasoning !== state.set_record.requested_reasoning) {
    throw new EffectError("IDEMPOTENCY_CONFLICT", "Requested reasoning mismatch");
  }
  const duplicate = state.inbox.find((entry) => entry.effect_id === effect.effect_id);
  if (duplicate !== undefined) {
    const replay = createInboxRecord({ ...input, requested_model: state.set_record.requested_model,
      requested_reasoning: state.set_record.requested_reasoning,
      observed_state_revision: duplicate.observed_state_revision });
    if (canonicalSha256(duplicate) !== canonicalSha256(replay)) {
      throw new EffectError("DUPLICATE_CONFLICT", "Conflicting duplicate inbox");
    }
    return { state, inbox: duplicate, replayed: true };
  }
  const observed = input.observed_state_revision ?? state.revision;
  if (observed < state.revision) throw new EffectError("STALE_REVISION", "Inbox revision is stale");
  if (observed > state.revision) throw new EffectError("SKIPPED_REVISION", "Inbox revision skips state");
  const inbox = createInboxRecord({ ...input, requested_model: state.set_record.requested_model,
    requested_reasoning: state.set_record.requested_reasoning, observed_state_revision: observed });
  if (effect.status !== "RESERVED") throw new EffectError("DUPLICATE_CONFLICT", "Effect is no longer reserved");
  const status = input.transport_status === "ACK" ? "ACKED" : input.transport_status === "FAILURE" ? "FAILED" : "UNKNOWN";
  const outbox = state.outbox.map((entry) => entry.effect_id === effect.effect_id ? { ...entry, status } : entry);
  const next: EffectState = { ...state, revision: state.revision + 1, outbox, inbox: [...state.inbox, inbox] };
  assertEffectState(next);
  return { state: next, inbox, replayed: false };
}
export const mapInboxObservation = observeInbox;
export const recordInbox = observeInbox;
export const applyInboxObservation = observeInbox;
