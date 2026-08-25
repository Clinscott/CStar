import { canonicalJson, canonicalSha256, hashOmittingField, isPlainJsonObject, withSelfHash } from "./canonical.js";
import {
  PROJECT_CONTROLLER_DISPATCH,
  type EffectInboxRecord,
  type EffectOutboxRecord,
  type InboxObservationInput,
  verifyOutboxRecord,
} from "./effects.js";

export const TRANSPORT_EVIDENCE_SCHEMA = "corvus.native_task_control_evidence.v1" as const;
export const TASK_CONTROL_KINDS = [
  "TASK_CREATE", "TASK_RESUME", "TASK_FORK", "TASK_SEND", "TASK_WAIT", "TASK_READ",
] as const;
export type NativeTaskControlKind = (typeof TASK_CONTROL_KINDS)[number];
export type TransportStatus = "ACK" | "FAILURE" | "UNKNOWN";

type JsonRecord = Record<string, unknown>;
const SHA256 = /^[0-9a-f]{64}$/u;
const TASK_KINDS = new Set<string>(TASK_CONTROL_KINDS);

export interface NativeTaskControlRequest extends JsonRecord {
  readonly kind: NativeTaskControlKind;
}

export interface NativeTaskControlBinding {
  readonly effect_id: string;
  readonly idempotency_key: string;
  readonly effect_kind: typeof PROJECT_CONTROLLER_DISPATCH;
  readonly controller_generation: string;
  readonly packet_sha256: string;
  readonly payload_sha256: string;
  readonly request_sha256: string;
  readonly requested_model: string;
  readonly requested_reasoning: string;
  readonly actual_identity: string;
  readonly request: NativeTaskControlRequest;
}

export type NativeTaskControlExecutor = (
  request: NativeTaskControlRequest,
  binding: NativeTaskControlBinding,
) => unknown | Promise<unknown>;

export interface TransportInvocationInput {
  readonly effect: EffectOutboxRecord;
  readonly packet_sha256?: string;
  readonly packet?: unknown;
  readonly payload: unknown;
  readonly request: unknown;
  readonly executor: NativeTaskControlExecutor;
  readonly requested_model?: string;
  readonly requested_reasoning?: string;
  readonly actual_identity?: string;
}

export interface TransportEvidence {
  readonly schema: typeof TRANSPORT_EVIDENCE_SCHEMA;
  readonly effect_id: string;
  readonly idempotency_key: string;
  readonly effect_kind: typeof PROJECT_CONTROLLER_DISPATCH;
  readonly controller_generation: string;
  readonly packet_sha256: string;
  readonly payload_sha256: string;
  readonly request_sha256: string;
  readonly request: NativeTaskControlRequest;
  readonly transport_status: TransportStatus;
  readonly terminal_observed: boolean | null;
  readonly native_response_sha256: string | null;
  readonly result_sha256: string | null;
  readonly failure_code: string | null;
  readonly requested_model: string;
  readonly requested_reasoning: string;
  readonly actual_identity: string;
  readonly native_call_count: number;
  readonly bounded_wait_count: number;
  readonly poll_count: number;
  readonly retry_count: number;
  readonly replay_count: number;
  readonly replacement_count: number;
  readonly fallback_count: number;
  readonly continuation_count: number;
  readonly duplicate_external_effects: number;
  readonly protected_effects: number;
  readonly lifecycle_mutated: false;
  readonly authority_granted: false;
  readonly root_authority: "none";
  readonly evidence_sha256: string;
}

export interface TransportInvocationResult {
  readonly status: TransportStatus;
  readonly evidence: TransportEvidence;
  readonly inbox_observation: InboxObservationInput;
  readonly observation: InboxObservationInput;
  readonly inbox?: EffectInboxRecord;
}

export type TransportErrorCode =
  | "INVALID_RESERVATION"
  | "RESERVATION_REQUIRED"
  | "INVALID_PACKET"
  | "PACKET_CONFLICT"
  | "PAYLOAD_CONFLICT"
  | "INVALID_REQUEST"
  | "INVALID_EXECUTOR";

export class TransportBoundaryError extends Error {
  readonly code: TransportErrorCode;

  constructor(code: TransportErrorCode, message: string) {
    super(message);
    this.name = "TransportBoundaryError";
    this.code = code;
  }
}

function record(value: unknown): value is JsonRecord {
  return isPlainJsonObject(value);
}

function hash(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function cloneCanonical<T>(value: T, code: TransportErrorCode, label: string): T {
  try {
    return JSON.parse(canonicalJson(value)) as T;
  } catch (error) {
    throw new TransportBoundaryError(code, `${label} is not canonical JSON: ${String(error)}`);
  }
}

function packetHash(input: TransportInvocationInput): string {
  let discovered: string | undefined;
  if (typeof input.packet === "string") {
    discovered = input.packet;
  } else if (record(input.packet) && typeof input.packet.packet_sha256 === "string") {
    discovered = input.packet.packet_sha256;
    if (input.packet.schema === "corvus.work_packet.v1"
      && typeof input.packet.packet_sha256 === "string"
      && !hash(input.packet.packet_sha256)) {
      throw new TransportBoundaryError("INVALID_PACKET", "Work packet hash is invalid");
    }
  } else if (input.packet !== undefined) {
    try {
      discovered = canonicalSha256(input.packet);
    } catch (error) {
      throw new TransportBoundaryError("INVALID_PACKET", `Packet is not canonical JSON: ${String(error)}`);
    }
  }
  const supplied = input.packet_sha256;
  if (supplied !== undefined && !hash(supplied)) {
    throw new TransportBoundaryError("INVALID_PACKET", "packet_sha256 is not a SHA-256 hash");
  }
  if (discovered !== undefined && !hash(discovered)) {
    throw new TransportBoundaryError("INVALID_PACKET", "Packet hash is not a SHA-256 hash");
  }
  if (supplied !== undefined && discovered !== undefined && supplied !== discovered) {
    throw new TransportBoundaryError("PACKET_CONFLICT", "Packet hash does not bind the packet bytes");
  }
  if (supplied !== undefined) return supplied;
  if (discovered !== undefined) return discovered;
  throw new TransportBoundaryError("INVALID_PACKET", "A packet hash or packet bytes are required");
}

function packetField(input: TransportInvocationInput, field: string): string | undefined {
  if (!record(input.packet)) return undefined;
  return typeof input.packet[field] === "string" ? input.packet[field] : undefined;
}

function prepareRequest(value: unknown): NativeTaskControlRequest {
  if (!record(value) || !nonEmpty(value.kind) || !TASK_KINDS.has(value.kind)) {
    throw new TransportBoundaryError("INVALID_REQUEST", "Native request kind is not one of the six task-control effects");
  }
  if (Object.keys(value).some((key) => key.startsWith("lifecycle") || key.includes("authority")
    || key === "operator_grant" || key === "controller_generation" || key === "effect_id")) {
    throw new TransportBoundaryError("INVALID_REQUEST", "Native request contains lifecycle or authority material");
  }
  const request = cloneCanonical(value, "INVALID_REQUEST", "Native request");
  if (!record(request) || !TASK_KINDS.has(String(request.kind))) {
    throw new TransportBoundaryError("INVALID_REQUEST", "Native request changed during canonical binding");
  }
  if (request.kind === "TASK_WAIT") {
    const args = request.args;
    const candidate = [request.timeout_ms, request.wait_ms, request.timeout_seconds, request.deadline_ms]
      .concat(record(args) ? [args.timeout_ms, args.timeout_seconds] : [])
      .find((entry) => entry !== undefined);
    if (typeof candidate !== "number" || !Number.isSafeInteger(candidate) || candidate <= 0
      || candidate > 86_400_000) {
      throw new TransportBoundaryError("INVALID_REQUEST", "TASK_WAIT requires one bounded positive timeout");
    }
  }
  return Object.freeze(request) as NativeTaskControlRequest;
}

function validateReservedEffect(effect: unknown): asserts effect is EffectOutboxRecord {
  if (!verifyOutboxRecord(effect)) {
    throw new TransportBoundaryError("INVALID_RESERVATION", "Effect is not a verified outbox record");
  }
  if (effect.status !== "RESERVED") {
    throw new TransportBoundaryError("RESERVATION_REQUIRED", "A RESERVED outbox effect is required before invocation");
  }
  if (effect.effect_kind !== PROJECT_CONTROLLER_DISPATCH) {
    throw new TransportBoundaryError("INVALID_RESERVATION", "Effect kind is not the authorized S02 dispatch kind");
  }
}

export function bindTransportInvocation(input: TransportInvocationInput): NativeTaskControlBinding {
  if (!record(input)) throw new TransportBoundaryError("INVALID_RESERVATION", "Transport input is not an object");
  validateReservedEffect(input.effect);
  if (typeof input.executor !== "function") {
    throw new TransportBoundaryError("INVALID_EXECUTOR", "An injected native task-control executor is required");
  }
  const packet_sha256 = packetHash(input);
  for (const [field, expected] of [["set_id", input.effect.set_id], ["cell_id", input.effect.cell_id],
    ["controller_generation", input.effect.controller_generation]] as const) {
    const observed = packetField(input, field);
    if (observed !== undefined && observed !== expected) {
      throw new TransportBoundaryError("PACKET_CONFLICT", `Packet ${field} does not match the reserved effect`);
    }
  }
  let payload_sha256: string;
  try {
    payload_sha256 = canonicalSha256(input.payload);
  } catch (error) {
    throw new TransportBoundaryError("PAYLOAD_CONFLICT", `Payload is not canonical JSON: ${String(error)}`);
  }
  if (payload_sha256 !== input.effect.payload_sha256) {
    throw new TransportBoundaryError("PAYLOAD_CONFLICT", "Payload bytes do not match the reserved effect");
  }
  const request = prepareRequest(input.request);
  const request_sha256 = canonicalSha256(request);
  const requested_model = input.requested_model ?? packetField(input, "requested_model") ?? "unreported";
  const requested_reasoning = input.requested_reasoning ?? packetField(input, "requested_reasoning") ?? "unreported";
  const actual_identity = input.actual_identity ?? "unreported";
  if (!nonEmpty(requested_model) || !nonEmpty(requested_reasoning) || !nonEmpty(actual_identity)) {
    throw new TransportBoundaryError("INVALID_PACKET", "Model, reasoning, and identity values must be non-empty");
  }
  return Object.freeze({
    effect_id: input.effect.effect_id,
    idempotency_key: input.effect.idempotency_key,
    effect_kind: input.effect.effect_kind,
    controller_generation: input.effect.controller_generation,
    packet_sha256,
    payload_sha256,
    request_sha256,
    requested_model,
    requested_reasoning,
    actual_identity,
    request,
  });
}

function authorityOrLifecycle(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(authorityOrLifecycle);
  if (!record(value)) return false;
  return Object.entries(value).some(([key, child]) => key.includes("authority") || key.startsWith("lifecycle")
    || key === "operator_grant" || key === "controller" || authorityOrLifecycle(child));
}

interface ResponseProjection {
  readonly status: TransportStatus;
  readonly terminal_observed: boolean | null;
  readonly native_response_sha256: string | null;
  readonly result?: unknown;
  readonly result_present: boolean;
  readonly failure_code: string | null;
  readonly host_task_id: string | null;
  readonly host_turn_id: string | null;
  readonly returned_thread_id: string | null;
  readonly returned_turn_id: string | null;
}

function responseId(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (!nonEmpty(value)) throw new Error(`${field} is not a non-empty identifier`);
  return value;
}

function classifyResponse(value: unknown): ResponseProjection {
  let response_sha256: string | null = null;
  try { response_sha256 = canonicalSha256(value); } catch { response_sha256 = null; }
  const unknown = (failure_code: string, terminal_observed: boolean | null = null): ResponseProjection => ({
    status: "UNKNOWN", terminal_observed, native_response_sha256: response_sha256,
    result_present: false, failure_code, host_task_id: null, host_turn_id: null,
    returned_thread_id: null, returned_turn_id: null,
  });
  if (response_sha256 === null) return unknown("MALFORMED_RESPONSE");
  if (!record(value) || authorityOrLifecycle(value)) return unknown("MALFORMED_OR_UNTRUSTED_RESPONSE");
  const status = value.status;
  const terminal = value.terminal;
  if (typeof terminal !== "boolean") return unknown("NONTERMINAL_OR_AMBIGUOUS_RESPONSE");
  if (terminal !== true) return unknown("NONTERMINAL_RESPONSE", false);
  for (const field of ["polls", "retries", "fallbacks", "continuations", "attempts"]) {
    if (typeof value[field] === "number" && value[field] > 0) return unknown("UNAUTHORIZED_RETRY_OR_POLL");
  }
  try {
    const ids = {
      host_task_id: responseId(value.host_task_id, "host_task_id"),
      host_turn_id: responseId(value.host_turn_id, "host_turn_id"),
      returned_thread_id: responseId(value.returned_thread_id, "returned_thread_id"),
      returned_turn_id: responseId(value.returned_turn_id, "returned_turn_id"),
    };
    if (status === "ACK") {
      if (value.failure_code !== undefined || value.error !== undefined || value.uncertain === true) {
        return unknown("CONFLICTING_RESPONSE", true);
      }
      return {
        status: "ACK", terminal_observed: true, native_response_sha256: response_sha256,
        result: value.result, result_present: Object.prototype.hasOwnProperty.call(value, "result"),
        failure_code: null, ...ids,
      };
    }
    if (status === "FAILURE") {
      if (!nonEmpty(value.failure_code) || value.result !== undefined || value.error !== undefined) {
        return unknown("CONFLICTING_RESPONSE", true);
      }
      return {
        status: "FAILURE", terminal_observed: true, native_response_sha256: response_sha256,
        result_present: false, failure_code: value.failure_code, ...ids,
      };
    }
    return unknown(status === "UNKNOWN" ? "NATIVE_UNKNOWN" : "UNRECOGNIZED_RESPONSE", true);
  } catch {
    return unknown("MALFORMED_RESPONSE", true);
  }
}

function evidence(binding: NativeTaskControlBinding, projection: ResponseProjection): TransportEvidence {
  const base = {
    schema: TRANSPORT_EVIDENCE_SCHEMA,
    effect_id: binding.effect_id,
    idempotency_key: binding.idempotency_key,
    effect_kind: binding.effect_kind,
    controller_generation: binding.controller_generation,
    packet_sha256: binding.packet_sha256,
    payload_sha256: binding.payload_sha256,
    request_sha256: binding.request_sha256,
    request: binding.request,
    transport_status: projection.status,
    terminal_observed: projection.terminal_observed,
    native_response_sha256: projection.native_response_sha256,
    result_sha256: projection.result_present ? canonicalSha256(projection.result) : null,
    failure_code: projection.failure_code,
    requested_model: binding.requested_model,
    requested_reasoning: binding.requested_reasoning,
    actual_identity: binding.actual_identity,
    native_call_count: 1,
    bounded_wait_count: binding.request.kind === "TASK_WAIT" ? 1 : 0,
    poll_count: 0,
    retry_count: 0,
    replay_count: 0,
    replacement_count: 0,
    fallback_count: 0,
    continuation_count: 0,
    duplicate_external_effects: 0,
    protected_effects: 0,
    lifecycle_mutated: false as const,
    authority_granted: false as const,
    root_authority: "none" as const,
  };
  return withSelfHash(base, "evidence_sha256") as TransportEvidence;
}

function observation(binding: NativeTaskControlBinding, projection: ResponseProjection): InboxObservationInput {
  const base: InboxObservationInput = {
    effect_id: binding.effect_id,
    idempotency_key: binding.idempotency_key,
    transport_status: projection.status,
    host_task_id: projection.host_task_id,
    host_turn_id: projection.host_turn_id,
    returned_thread_id: projection.returned_thread_id,
    returned_turn_id: projection.returned_turn_id,
    requested_model: binding.requested_model,
    requested_reasoning: binding.requested_reasoning,
    actual_identity: binding.actual_identity,
    result_sha256: projection.result_present ? canonicalSha256(projection.result) : null,
    received_at_measured: "unavailable",
    failure_code: projection.failure_code,
  };
  return projection.result_present ? { ...base, result: projection.result } : base;
}

export async function invokeNativeTaskControl(input: TransportInvocationInput): Promise<TransportInvocationResult> {
  const binding = bindTransportInvocation(input);
  let raw: unknown;
  try {
    raw = await input.executor(binding.request, binding);
  } catch {
    raw = undefined;
  }
  const projection = raw === undefined ? {
    status: "UNKNOWN" as const, terminal_observed: null, native_response_sha256: null,
    result_present: false, failure_code: "EXECUTOR_THROWN_OR_NO_RESPONSE",
    host_task_id: null, host_turn_id: null, returned_thread_id: null, returned_turn_id: null,
  } : classifyResponse(raw);
  const ev = evidence(binding, projection);
  const inputObservation = observation(binding, projection);
  return { status: projection.status, evidence: ev, inbox_observation: inputObservation, observation: inputObservation };
}

export const executeTransport = invokeNativeTaskControl;
export const dispatchNativeTaskControl = invokeNativeTaskControl;
export const callNativeTaskControl = invokeNativeTaskControl;
export const prepareTransportCall = bindTransportInvocation;

const EVIDENCE_KEYS = [
  "schema", "effect_id", "idempotency_key", "effect_kind", "controller_generation", "packet_sha256",
  "payload_sha256", "request_sha256", "request", "transport_status", "terminal_observed",
  "native_response_sha256", "result_sha256", "failure_code", "requested_model", "requested_reasoning",
  "actual_identity", "native_call_count", "bounded_wait_count", "poll_count", "retry_count", "replay_count",
  "replacement_count", "fallback_count", "continuation_count", "duplicate_external_effects",
  "protected_effects", "lifecycle_mutated", "authority_granted", "root_authority", "evidence_sha256",
] as const;

function exactKeys(value: JsonRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function verifyTransportEvidence(value: unknown): value is TransportEvidence {
  if (!record(value) || !exactKeys(value, EVIDENCE_KEYS) || value.schema !== TRANSPORT_EVIDENCE_SCHEMA) return false;
  if (!nonEmpty(value.effect_id) || !nonEmpty(value.idempotency_key) || value.effect_kind !== PROJECT_CONTROLLER_DISPATCH
    || !nonEmpty(value.controller_generation) || !hash(value.packet_sha256) || !hash(value.payload_sha256)
    || !hash(value.request_sha256) || !record(value.request) || !TASK_KINDS.has(String(value.request.kind))
    || !["ACK", "FAILURE", "UNKNOWN"].includes(String(value.transport_status))
    || (value.terminal_observed !== null && typeof value.terminal_observed !== "boolean")
    || (value.native_response_sha256 !== null && !hash(value.native_response_sha256))
    || (value.result_sha256 !== null && !hash(value.result_sha256))
    || (value.failure_code !== null && !nonEmpty(value.failure_code))
    || !nonEmpty(value.requested_model) || !nonEmpty(value.requested_reasoning) || !nonEmpty(value.actual_identity)
    || value.native_call_count !== 1 || value.bounded_wait_count !== (value.request.kind === "TASK_WAIT" ? 1 : 0)
    || value.poll_count !== 0 || value.retry_count !== 0 || value.replay_count !== 0 || value.replacement_count !== 0
    || value.fallback_count !== 0 || value.continuation_count !== 0 || value.duplicate_external_effects !== 0
    || value.protected_effects !== 0 || value.lifecycle_mutated !== false || value.authority_granted !== false
    || value.root_authority !== "none" || !hash(value.evidence_sha256)) return false;
  try { return hashOmittingField(value, "evidence_sha256") === value.evidence_sha256; } catch { return false; }
}

export const validateTransportEvidence = verifyTransportEvidence;
export const createTransportEvidence = invokeNativeTaskControl;
