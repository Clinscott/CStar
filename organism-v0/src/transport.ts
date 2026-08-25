import { canonicalJson, canonicalSha256, hashOmittingField, isPlainJsonObject, withSelfHash } from "./canonical.js";
import { assertEffectState, assertOutboxRecord, PROJECT_CONTROLLER_DISPATCH, type EffectOutboxRecord,
  type EffectState, type InboxObservationInput } from "./effects.js";
import { assertSetRecord, type SetRecord } from "./work_packets.js";

export const TRANSPORT_EVIDENCE_SCHEMA = "corvus.task_control_transport.v1" as const;
export const NATIVE_TASK_REQUEST_SCHEMA = "corvus.native_task_request.v1" as const;

export const TASK_CREATE = "TASK_CREATE" as const; export const TASK_RESUME = "TASK_RESUME" as const;
export const TASK_FORK = "TASK_FORK" as const; export const TASK_SEND = "TASK_SEND" as const;
export const TASK_WAIT = "TASK_WAIT" as const; export const TASK_READ = "TASK_READ" as const;

export const TASK_CONTROL_KINDS = Object.freeze([TASK_CREATE, TASK_RESUME, TASK_FORK, TASK_SEND, TASK_WAIT, TASK_READ] as const);
export type TaskControlKind = typeof TASK_CONTROL_KINDS[number];
export type NativeTransportStatus = "ACK" | "FAILURE" | "UNKNOWN";

export type TransportErrorCode = "INVALID_INPUT" | "INVALID_EFFECT" | "UNRESERVED_EFFECT" | "STALE_GENERATION"
  | "EFFECT_MISMATCH" | "INVALID_REQUEST" | "IDEMPOTENCY_CONFLICT";

export class TransportBoundaryError extends Error {
  readonly code: TransportErrorCode; readonly details: Readonly<Record<string, unknown>>;
  constructor(code: TransportErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message); this.name = "TransportBoundaryError"; this.code = code; this.details = Object.freeze({ ...details });
  }
}

export interface NativeTaskBinding {
  readonly schema: typeof NATIVE_TASK_REQUEST_SCHEMA; readonly effect_id: string; readonly idempotency_key: string;
  readonly effect_kind: typeof PROJECT_CONTROLLER_DISPATCH; readonly controller_generation: string;
  readonly packet_sha256: string; readonly payload_sha256: string; readonly native_request_sha256: string;
  readonly task_kind: TaskControlKind;
}

export type NativeTaskRequest = Readonly<Record<string, unknown>>;
export type NativeTaskControlExecutor = (request: NativeTaskRequest, binding: NativeTaskBinding) => unknown | Promise<unknown>;

export interface TransportInvocationInput {
  readonly state?: EffectState; readonly effect?: EffectOutboxRecord; readonly outbox?: EffectOutboxRecord;
  readonly packet_sha256?: string; readonly packet_hash?: string; readonly work_packet_sha256?: string;
  readonly payload: unknown; readonly payload_sha256?: string; readonly native_request?: NativeTaskRequest;
  readonly request?: NativeTaskRequest; readonly native_request_sha256?: string; readonly requested_model?: string;
  readonly requested_reasoning?: string; readonly controller_generation?: string; readonly effect_kind?: string;
  readonly set_id?: string; readonly set_record?: SetRecord;
}

export interface TransportEvidence {
  readonly schema: typeof TRANSPORT_EVIDENCE_SCHEMA; readonly effect_id: string; readonly idempotency_key: string;
  readonly effect_kind: typeof PROJECT_CONTROLLER_DISPATCH; readonly controller_generation: string;
  readonly packet_sha256: string; readonly payload_sha256: string; readonly native_request: NativeTaskRequest;
  readonly native_request_sha256: string; readonly task_kind: TaskControlKind; readonly transport_status: NativeTransportStatus;
  readonly host_task_id: string | null; readonly host_turn_id: string | null; readonly returned_thread_id: string | null;
  readonly returned_turn_id: string | null; readonly requested_model: string; readonly requested_reasoning: string;
  readonly actual_identity: string; readonly result_sha256: string | null; readonly failure_code: string | null;
  readonly native_call_count: 0 | 1; readonly call_count: 0 | 1; readonly wait_count: 0 | 1;
  readonly poll_count: 0; readonly retry_count: 0; readonly duplicate_external_effects: 0; readonly evidence_sha256: string;
}

export interface NativeTaskControlAdapter {
  readonly invoke: (input: TransportInvocationInput) => Promise<TransportEvidence>;
  readonly dispatch: (input: TransportInvocationInput) => Promise<TransportEvidence>;
  readonly execute: (input: TransportInvocationInput) => Promise<TransportEvidence>;
  readonly call: (input: TransportInvocationInput) => Promise<TransportEvidence>;
}

const HASH = /^[0-9a-f]{64}$/u;
const OWN = Object.prototype.hasOwnProperty;
const INVOCATION_KEYS = new Set([
  "state", "effect", "outbox", "packet_sha256", "packet_hash", "work_packet_sha256", "payload",
  "payload_sha256", "native_request", "request", "native_request_sha256", "requested_model",
  "requested_reasoning", "controller_generation", "effect_kind", "set_id", "set_record",
]);
const AUTHORITY_KEYS = new Set([
  "authority", "operator_grant", "operator_grant_ref", "operator-grant", "transcript", "callback",
  "lifecycle", "lifecycle_authority", "lifecycle_state", "lifecycle_transition", "lifecycle_event",
  "lifecycle_status", "controller", "controller_generation", "set_id", "bead_id", "effect_id",
  "idempotency_key", "state_revision", "revision", "event_type", "terminal_packet",
  "acceptance", "validation_result", "root_authority",
]);
const STATUS_KEYS = ["status", "transport_status", "transportStatus"] as const;
const TASK_KIND_KEYS = ["task_kind", "kind", "operation", "action"] as const;
const ID_ALIASES = {
  host_task_id: ["host_task_id", "task_id", "taskId"],
  host_turn_id: ["host_turn_id", "turn_id", "turnId"],
  returned_thread_id: ["returned_thread_id", "thread_id", "threadId", "returnedThreadId"],
  returned_turn_id: ["returned_turn_id", "returnedTurnId"],
} as const;
const IDENTITY_KEYS = ["actual_identity", "actualIdentity", "host_identity", "identity"] as const;
const FAILURE_KEYS = ["failure_code", "failureCode", "error_code", "errorCode", "code"] as const;
const MODEL_KEYS = ["requested_model", "requestedModel"] as const;
const REASONING_KEYS = ["requested_reasoning", "requestedReasoning"] as const;
const FINAL_KEYS = ["terminal", "final", "is_final", "final_observation"] as const;
const UNCERTAIN_KEYS = ["uncertain", "state_uncertain", "post_effect_uncertain"] as const;
const STATE_KEYS = ["post_effect_state", "postEffectState", "post_state", "observed_state"] as const;
const EXHAUSTED_CODES = new Set(["WAIT_EXHAUSTED", "BOUNDED_WAIT_EXHAUSTED", "WAIT_TIMEOUT", "TIMEOUT"]);

function record(value: unknown): value is Record<string, unknown> { return isPlainJsonObject(value); }
function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function hash(value: unknown): value is string { return typeof value === "string" && HASH.test(value); }
function optionalId(value: unknown): boolean { return value === null || nonEmpty(value); }
function fail(code: TransportErrorCode, message: string, details: Record<string, unknown> = {}): never {
  throw new TransportBoundaryError(code, message, details);
}

function assertInvocationShape(input: unknown): asserts input is TransportInvocationInput {
  if (!record(input)) fail("INVALID_INPUT", "Transport invocation must be a plain object");
  for (const key of Object.keys(input)) if (!INVOCATION_KEYS.has(key)) fail("INVALID_INPUT", `Unknown transport invocation field: ${key}`);
  if (!OWN.call(input, "payload")) fail("INVALID_INPUT", "Transport payload is required");
}

function aliases<T extends readonly string[]>(value: Record<string, unknown>, names: T): {
  present: boolean; value: unknown; conflict: boolean;
} {
  let present = false; let chosen: unknown; let conflict = false;
  for (const name of names) {
    if (!OWN.call(value, name)) continue;
    if (!present) {
      chosen = value[name]; present = true; continue;
    }
    if (value[name] !== chosen) conflict = true;
  }
  return { present, value: chosen, conflict };
}

function stringAlias(value: Record<string, unknown>, names: readonly string[], allowNull = false): {
  present: boolean; value: string | null; invalid: boolean; conflict: boolean;
} {
  const found = aliases(value, names);
  if (!found.present) return { present: false, value: null, invalid: false, conflict: false };
  if (found.conflict) return { present: true, value: null, invalid: false, conflict: true };
  if (found.value === null && allowNull) return { present: true, value: null, invalid: false, conflict: false };
  if (!nonEmpty(found.value)) return { present: true, value: null, invalid: true, conflict: false };
  return { present: true, value: found.value, invalid: false, conflict: false };
}

function containsAuthorityKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsAuthorityKey);
  if (!record(value)) return false;
  return Object.entries(value).some(([key, child]) => AUTHORITY_KEYS.has(key) || key.startsWith("lifecycle_")
    || key.startsWith("operator_grant") || containsAuthorityKey(child));
}

function canonicalValue(value: unknown, label: string): string {
  try { return canonicalSha256(value); } catch (error) {
    fail("INVALID_INPUT", `${label} is not canonical JSON`, { cause: String(error) });
  }
}

function extractTaskKind(request: Record<string, unknown>): TaskControlKind {
  const found = aliases(request, TASK_KIND_KEYS);
  if (!found.present || found.conflict || typeof found.value !== "string"
    || !(TASK_CONTROL_KINDS as readonly string[]).includes(found.value)) {
    fail("INVALID_REQUEST", "Native request has no one supported task-control kind");
  }
  return found.value as TaskControlKind;
}

function normalizeRequest(request: unknown): { request: NativeTaskRequest; task_kind: TaskControlKind; sha256: string } {
  if (!record(request) || containsAuthorityKey(request)) {
    fail("INVALID_REQUEST", "Native request is not a closed authority-free JSON object");
  }
  const task_kind = extractTaskKind(request);
  const serialized = canonicalJson(request);
  const normalized = JSON.parse(serialized) as NativeTaskRequest;
  return { request: normalized, task_kind, sha256: canonicalSha256(normalized) };
}

interface BoundInvocation {
  readonly effect: EffectOutboxRecord;
  readonly packet_sha256: string;
  readonly payload_sha256: string;
  readonly native_request: NativeTaskRequest;
  readonly native_request_sha256: string;
  readonly task_kind: TaskControlKind;
  readonly requested_model: string;
  readonly requested_reasoning: string;
  readonly binding: NativeTaskBinding;
  readonly replay_key: string;
  readonly signature: string;
}

function prepare(input: unknown): BoundInvocation {
  assertInvocationShape(input);
  const effectValue = input.effect ?? input.outbox;
  if (!record(effectValue)) fail("INVALID_EFFECT", "A verified RESERVED outbox effect is required");
  try { assertOutboxRecord(effectValue); } catch (error) {
    fail("INVALID_EFFECT", "Outbox effect is not verified", { cause: String(error) });
  }
  const effect = effectValue as EffectOutboxRecord;
  if (effect.status !== "RESERVED") fail("UNRESERVED_EFFECT", "Native transport requires RESERVED effect");
  if (effect.effect_kind !== PROJECT_CONTROLLER_DISPATCH) {
    fail("INVALID_EFFECT", "Native transport effect kind is not authorized");
  }
  if (input.state !== undefined) {
    try { assertEffectState(input.state); } catch (error) {
      fail("INVALID_EFFECT", "Effect state is not verified", { cause: String(error) });
    }
    const stateEffect = input.state.outbox.find((entry) => entry.effect_id === effect.effect_id);
    if (stateEffect === undefined || canonicalSha256(stateEffect) !== canonicalSha256(effect)) {
      fail("EFFECT_MISMATCH", "Effect is not the exact reserved state entry");
    }
    if (input.state.set_record.set_id !== effect.set_id) fail("EFFECT_MISMATCH", "Effect SET does not match state");
    if (input.state.set_record.controller_generation !== effect.controller_generation) {
      fail("STALE_GENERATION", "Effect generation does not match state");
    }
  }
  if (input.set_record !== undefined) {
    try { assertSetRecord(input.set_record); } catch (error) {
      fail("EFFECT_MISMATCH", "Provided SET record is not verified", { cause: String(error) });
    }
    if (input.set_record.set_id !== effect.set_id) fail("EFFECT_MISMATCH", "Effect SET does not match provided SET");
    if (input.set_record.controller_generation !== effect.controller_generation) {
      fail("STALE_GENERATION", "Effect generation does not match provided SET");
    }
  }
  if (input.set_id !== undefined && input.set_id !== effect.set_id) fail("EFFECT_MISMATCH", "SET identity mismatch");
  if (input.controller_generation !== undefined && input.controller_generation !== effect.controller_generation) {
    fail("STALE_GENERATION", "Controller generation mismatch");
  }
  if (input.effect_kind !== undefined && input.effect_kind !== effect.effect_kind) {
    fail("INVALID_EFFECT", "Effect kind mismatch");
  }
  const payload_sha256 = canonicalValue(input.payload, "Transport payload");
  if (payload_sha256 !== effect.payload_sha256) fail("EFFECT_MISMATCH", "Payload hash does not match reservation");
  if (input.payload_sha256 !== undefined && input.payload_sha256 !== payload_sha256) {
    fail("EFFECT_MISMATCH", "Supplied payload hash does not match payload bytes");
  }
  const packetHashes = [input.packet_sha256, input.packet_hash, input.work_packet_sha256].filter(
    (value): value is string => value !== undefined,
  );
  const payloadRecord = record(input.payload) ? input.payload : undefined;
  if (packetHashes.length === 0 && payloadRecord !== undefined && typeof payloadRecord.packet_sha256 === "string") {
    packetHashes.push(payloadRecord.packet_sha256);
  }
  if (packetHashes.length === 0 || packetHashes.some((value) => !hash(value))
    || new Set(packetHashes).size !== 1) {
    fail("EFFECT_MISMATCH", "Exactly one packet SHA-256 binding is required");
  }
  const packet_sha256 = packetHashes[0] as string;
  const requests = [input.native_request, input.request].filter(
    (value): value is NativeTaskRequest => value !== undefined,
  );
  if (requests.length === 0 || (requests.length === 2 && canonicalValue(requests[0], "Native request")
    !== canonicalValue(requests[1], "Native request"))) {
    fail("INVALID_REQUEST", "Exactly one native request is required");
  }
  const normalized = normalizeRequest(requests[0]);
  const suppliedRequestHash = input.native_request_sha256;
  if (suppliedRequestHash !== undefined && suppliedRequestHash !== normalized.sha256) {
    fail("EFFECT_MISMATCH", "Native request hash does not bind request bytes");
  }
  const stateSet = input.state?.set_record;
  const providedSet = input.set_record;
  const requested_model = stateSet?.requested_model ?? providedSet?.requested_model
    ?? input.requested_model ?? "unreported";
  const requested_reasoning = stateSet?.requested_reasoning ?? providedSet?.requested_reasoning
    ?? input.requested_reasoning ?? "unreported";
  if (!nonEmpty(requested_model) || !nonEmpty(requested_reasoning)) fail("INVALID_INPUT", "Requested selector is invalid");
  if (input.requested_model !== undefined && input.requested_model !== requested_model) {
    fail("EFFECT_MISMATCH", "Requested model does not match bound SET");
  }
  if (input.requested_reasoning !== undefined && input.requested_reasoning !== requested_reasoning) {
    fail("EFFECT_MISMATCH", "Requested reasoning does not match bound SET");
  }
  const binding: NativeTaskBinding = {
    schema: NATIVE_TASK_REQUEST_SCHEMA, effect_id: effect.effect_id, idempotency_key: effect.idempotency_key,
    effect_kind: effect.effect_kind, controller_generation: effect.controller_generation, packet_sha256,
    payload_sha256, native_request_sha256: normalized.sha256, task_kind: normalized.task_kind,
  };
  const replay_key = `${effect.effect_id}\n${effect.idempotency_key}`;
  const signature = canonicalSha256({ packet_sha256, payload_sha256, native_request: normalized.request,
    effect_kind: effect.effect_kind, controller_generation: effect.controller_generation });
  return {
    effect, packet_sha256, payload_sha256, native_request: normalized.request,
    native_request_sha256: normalized.sha256, task_kind: normalized.task_kind,
    requested_model, requested_reasoning, binding, replay_key, signature,
  };
}

interface ResponseFields {
  readonly host_task_id: string | null;
  readonly host_turn_id: string | null;
  readonly returned_thread_id: string | null;
  readonly returned_turn_id: string | null;
  readonly actual_identity: string;
  readonly result_sha256: string | null;
}

function responseFields(response: Record<string, unknown>): ResponseFields | null {
  const ids = Object.entries(ID_ALIASES).map(([key, names]) => {
    const found = stringAlias(response, names, true);
    return [key, found] as const;
  });
  if (ids.some(([, found]) => found.invalid || found.conflict)) return null;
  const identity = stringAlias(response, IDENTITY_KEYS, true);
  if (identity.invalid || identity.conflict) return null;
  let result_sha256: string | null = null;
  if (OWN.call(response, "result_sha256")) {
    if (response.result_sha256 !== null && !hash(response.result_sha256)) return null;
    result_sha256 = response.result_sha256 as string | null;
  }
  if (OWN.call(response, "result")) {
    let resultHash: string;
    try { resultHash = canonicalSha256(response.result); } catch { return null; }
    if (result_sha256 !== null && result_sha256 !== resultHash) return null;
    result_sha256 = resultHash;
  }
  return {
    host_task_id: ids.find(([key]) => key === "host_task_id")?.[1].value ?? null,
    host_turn_id: ids.find(([key]) => key === "host_turn_id")?.[1].value ?? null,
    returned_thread_id: ids.find(([key]) => key === "returned_thread_id")?.[1].value ?? null,
    returned_turn_id: ids.find(([key]) => key === "returned_turn_id")?.[1].value ?? null,
    actual_identity: identity.value ?? "unreported", result_sha256,
  };
}

function statusOf(response: Record<string, unknown>): NativeTransportStatus | null {
  const found = aliases(response, STATUS_KEYS);
  if (!found.present || found.conflict || typeof found.value !== "string") return null;
  return found.value === "ACK" || found.value === "FAILURE" || found.value === "UNKNOWN" ? found.value : null;
}

function failureOf(response: Record<string, unknown>): { value: string | null; invalid: boolean; conflict: boolean } {
  const found = stringAlias(response, FAILURE_KEYS);
  return { value: found.value, invalid: found.invalid, conflict: found.conflict };
}

function selectorMatches(response: Record<string, unknown>, bound: BoundInvocation): boolean {
  const model = stringAlias(response, MODEL_KEYS);
  const reasoning = stringAlias(response, REASONING_KEYS);
  return !model.invalid && !model.conflict && !reasoning.invalid && !reasoning.conflict
    && (!model.present || model.value === bound.requested_model)
    && (!reasoning.present || reasoning.value === bound.requested_reasoning);
}

function isUncertain(response: Record<string, unknown>): boolean {
  for (const key of UNCERTAIN_KEYS) if (response[key] === true) return true;
  for (const key of STATE_KEYS) {
    if (!OWN.call(response, key)) continue;
    const value = response[key];
    if (typeof value !== "string") return true;
    if (["UNKNOWN", "UNCERTAIN", "UNAVAILABLE", "EXHAUSTED"].includes(value.toUpperCase())) return true;
  }
  return false;
}

function finalObservation(response: Record<string, unknown>): { present: boolean; valid: boolean; value: boolean } {
  const found = aliases(response, FINAL_KEYS);
  if (!found.present) return { present: false, valid: true, value: false };
  return { present: true, valid: typeof found.value === "boolean" && !found.conflict, value: found.value === true };
}

function baseEvidence(bound: BoundInvocation, status: NativeTransportStatus, fields: Partial<ResponseFields>, failure_code: string | null): TransportEvidence {
  const wait_count = bound.task_kind === TASK_WAIT ? 1 : 0;
  const base = {
    schema: TRANSPORT_EVIDENCE_SCHEMA, effect_id: bound.effect.effect_id, idempotency_key: bound.effect.idempotency_key,
    effect_kind: bound.effect.effect_kind, controller_generation: bound.effect.controller_generation,
    packet_sha256: bound.packet_sha256, payload_sha256: bound.payload_sha256,
    native_request: bound.native_request, native_request_sha256: bound.native_request_sha256,
    task_kind: bound.task_kind, transport_status: status,
    host_task_id: fields?.host_task_id ?? null, host_turn_id: fields?.host_turn_id ?? null,
    returned_thread_id: fields?.returned_thread_id ?? null, returned_turn_id: fields?.returned_turn_id ?? null,
    requested_model: bound.requested_model, requested_reasoning: bound.requested_reasoning,
    actual_identity: fields?.actual_identity ?? "unreported", result_sha256: fields?.result_sha256 ?? null,
    failure_code, native_call_count: 1 as const, call_count: 1 as const, wait_count: wait_count as 0 | 1,
    poll_count: 0 as const, retry_count: 0 as const, duplicate_external_effects: 0 as const,
  };
  return withSelfHash(base, "evidence_sha256") as TransportEvidence;
}

function unknownEvidence(bound: BoundInvocation, code: string, fields?: Partial<ResponseFields>): TransportEvidence {
  return baseEvidence(bound, "UNKNOWN", fields, code);
}

function mapResponse(bound: BoundInvocation, response: unknown): TransportEvidence {
  if (!record(response) || containsAuthorityKey(response)) return unknownEvidence(bound, "MALFORMED_RESPONSE");
  const status = statusOf(response);
  const fields = responseFields(response);
  if (status === null || fields === null || !selectorMatches(response, bound) || isUncertain(response)) {
    return unknownEvidence(bound, "MALFORMED_RESPONSE", fields ?? undefined);
  }
  const failure = failureOf(response);
  if (failure.invalid || failure.conflict) return unknownEvidence(bound, "MALFORMED_RESPONSE", fields);
  if (status === "UNKNOWN") return unknownEvidence(bound, failure.value ?? "NATIVE_UNKNOWN", fields);
  if (status === "ACK") {
    if (failure.value !== null) return unknownEvidence(bound, "CONFLICTING_RESPONSE", fields);
    const idsPresent = [fields.host_task_id, fields.host_turn_id, fields.returned_thread_id, fields.returned_turn_id]
      .some((value) => value !== null);
    if (!idsPresent) return unknownEvidence(bound, "MISSING_NATIVE_IDENTITY", fields);
    const final = finalObservation(response);
    if (!final.valid || (OWN.call(response, "final_observation") && !final.value)
      || (bound.task_kind === TASK_WAIT && (!final.present || !final.value))) {
      return unknownEvidence(bound, bound.task_kind === TASK_WAIT ? "WAIT_NOT_TERMINAL" : "MALFORMED_RESPONSE", fields);
    }
    return baseEvidence(bound, "ACK", fields, null);
  }
  if (failure.value === null) return unknownEvidence(bound, "MISSING_FAILURE_CODE", fields);
  if (EXHAUSTED_CODES.has(failure.value.toUpperCase())) {
    return unknownEvidence(bound, "WAIT_EXHAUSTED", fields);
  }
  return baseEvidence(bound, "FAILURE", fields, failure.value);
}

export function verifyTransportEvidence(value: unknown): value is TransportEvidence {
  if (!record(value)) return false;
  const keys = [
    "schema", "effect_id", "idempotency_key", "effect_kind", "controller_generation", "packet_sha256",
    "payload_sha256", "native_request", "native_request_sha256", "task_kind", "transport_status",
    "host_task_id", "host_turn_id", "returned_thread_id", "returned_turn_id", "requested_model",
    "requested_reasoning", "actual_identity", "result_sha256", "failure_code", "native_call_count", "call_count",
    "wait_count", "poll_count", "retry_count", "duplicate_external_effects", "evidence_sha256",
  ];
  const actual = Object.keys(value).sort();
  if (actual.length !== keys.length || !actual.every((key, index) => key === [...keys].sort()[index])) return false;
  if (value.schema !== TRANSPORT_EVIDENCE_SCHEMA || value.effect_kind !== PROJECT_CONTROLLER_DISPATCH
    || !nonEmpty(value.effect_id) || !nonEmpty(value.idempotency_key) || !nonEmpty(value.controller_generation)
    || !hash(value.packet_sha256) || !hash(value.payload_sha256) || !record(value.native_request)
    || !hash(value.native_request_sha256) || !(TASK_CONTROL_KINDS as readonly string[]).includes(String(value.task_kind))
    || !["ACK", "FAILURE", "UNKNOWN"].includes(String(value.transport_status))
    || !optionalId(value.host_task_id) || !optionalId(value.host_turn_id)
    || !optionalId(value.returned_thread_id) || !optionalId(value.returned_turn_id)
    || !nonEmpty(value.requested_model) || !nonEmpty(value.requested_reasoning) || !nonEmpty(value.actual_identity)
    || (value.result_sha256 !== null && !hash(value.result_sha256))
    || (value.failure_code !== null && !nonEmpty(value.failure_code))
    || value.native_call_count !== 1 || value.call_count !== 1 || ![0, 1].includes(Number(value.wait_count))
    || value.poll_count !== 0 || value.retry_count !== 0 || value.duplicate_external_effects !== 0
    || !hash(value.evidence_sha256)) return false;
  try {
    return !containsAuthorityKey(value.native_request)
      && extractTaskKind(value.native_request) === value.task_kind
      && canonicalSha256(value.native_request) === value.native_request_sha256
      && (value.transport_status !== "ACK" || value.failure_code === null)
      && (value.transport_status !== "FAILURE" || value.failure_code !== null)
      && hashOmittingField(value, "evidence_sha256") === value.evidence_sha256;
  } catch { return false; }
}

export function transportEvidenceToInboxObservation(evidence: TransportEvidence): InboxObservationInput {
  if (!verifyTransportEvidence(evidence)) throw new TransportBoundaryError("INVALID_INPUT", "Transport evidence is not verified");
  return {
    effect_id: evidence.effect_id, idempotency_key: evidence.idempotency_key,
    transport_status: evidence.transport_status, host_task_id: evidence.host_task_id,
    host_turn_id: evidence.host_turn_id, returned_thread_id: evidence.returned_thread_id,
    returned_turn_id: evidence.returned_turn_id, requested_model: evidence.requested_model,
    requested_reasoning: evidence.requested_reasoning, actual_identity: evidence.actual_identity,
    result_sha256: evidence.result_sha256, received_at_measured: "unavailable",
    failure_code: evidence.failure_code,
  };
}

export const toInboxObservation = transportEvidenceToInboxObservation;
export const projectInboxObservation = transportEvidenceToInboxObservation;

export function createNativeTaskControlAdapter(executor: NativeTaskControlExecutor): NativeTaskControlAdapter {
  if (typeof executor !== "function") throw new TransportBoundaryError("INVALID_INPUT", "Native executor is required");
  const replays = new Map<string, { signature: string; evidence: TransportEvidence }>();
  const invoke = async (input: TransportInvocationInput): Promise<TransportEvidence> => {
    const bound = prepare(input);
    const prior = replays.get(bound.replay_key);
    if (prior !== undefined) {
      if (prior.signature !== bound.signature) fail("IDEMPOTENCY_CONFLICT", "Effect replay request conflicts with prior request");
      return prior.evidence;
    }
    let response: unknown;
    try {
      response = await executor(bound.native_request, bound.binding);
    } catch {
      const evidence = unknownEvidence(bound, "NATIVE_THROWN");
      replays.set(bound.replay_key, { signature: bound.signature, evidence });
      return evidence;
    }
    const evidence = mapResponse(bound, response);
    replays.set(bound.replay_key, { signature: bound.signature, evidence });
    return evidence;
  };
  return { invoke, dispatch: invoke, execute: invoke, call: invoke };
}

export const createTaskControlAdapter = createNativeTaskControlAdapter;
export const createTransportAdapter = createNativeTaskControlAdapter;

export async function invokeNativeTaskControl(
  executor: NativeTaskControlExecutor,
  input: TransportInvocationInput,
): Promise<TransportEvidence> {
  return createNativeTaskControlAdapter(executor).invoke(input);
}

export const dispatchNativeTaskControl = invokeNativeTaskControl;
export const executeNativeTaskControl = invokeNativeTaskControl;
export const invokeTaskControl = invokeNativeTaskControl;
