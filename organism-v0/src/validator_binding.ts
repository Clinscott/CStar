import {
  canonicalSha256,
  hashOmittingField,
  isPlainJsonObject,
  sha256Hex,
  withSelfHash,
} from "./canonical.js";

export const VALIDATOR_DISPATCH_ACK_SCHEMA = "corvus.validator_dispatch_ack.v1" as const;
export const VALIDATOR_TERMINAL_SCHEMA = "corvus.validator_terminal.v1" as const;
export const VALIDATOR_BINDING_VERSION = 1 as const;
export const UNAVAILABLE_AT_DISPATCH = "UNAVAILABLE_AT_DISPATCH" as const;
export const BOUND_AT_TERMINAL = "BOUND_AT_TERMINAL" as const;

const SHA256 = /^[0-9a-f]{64}$/u;
const ACK_KEYS = ["schema", "event_kind", "binding_version", "bead_id", "set_id", "validation_id", "effect_id",
  "idempotency_key", "controller_generation", "expected_revision", "validator_task_id", "validator_turn_id_at_dispatch",
  "turn_state", "dispatch_provenance_path", "dispatch_provenance_sha256", "host_spawn_receipt_sha256",
  "work_packet_sha256", "validation_scope_sha256", "requested_model", "requested_reasoning", "actual_identity",
  "validator_profile_hash", "terminal_schema", "protected_effects", "retry_count", "descendant_count",
  "observed_at_ms", "observed_elapsed_ms", "ack_content_sha256"] as const;
const TERMINAL_KEYS = ["schema", "event_kind", "binding_version", "bead_id", "set_id", "validation_id", "effect_id",
  "idempotency_key", "controller_generation", "expected_revision", "dispatch_ack_content_sha256", "validator_task_id",
  "validator_turn_id", "turn_state", "host_terminal_receipt_path", "host_terminal_receipt_sha256", "terminal_packet_path",
  "terminal_packet_sha256", "terminal_packet_schema", "evidence_manifest_path", "evidence_manifest_sha256",
  "evidence_manifest_schema", "evidence_materialization_order", "evidence_digest", "verdict", "requested_model",
  "requested_reasoning", "actual_identity", "protected_effects", "retry_count", "descendant_count", "observed_at_ms",
  "observed_elapsed_ms", "terminal_content_sha256"] as const;
const SIDEcar_KEYS = ["stage", "validation_id", "effect_id", "controller_generation", "validator_task_id",
  "dispatch_ack_content_sha256", "validator_turn_id", "terminal_content_sha256", "terminal_packet_sha256",
  "evidence_manifest_sha256"] as const;

type Hash = string;
type JsonRecord = Record<string, unknown>;

export interface ValidatorDispatchAck {
  readonly schema: typeof VALIDATOR_DISPATCH_ACK_SCHEMA;
  readonly event_kind: "VALIDATOR_DISPATCH_ACK";
  readonly binding_version: 1;
  readonly bead_id: string;
  readonly set_id: string;
  readonly validation_id: string;
  readonly effect_id: string;
  readonly idempotency_key: Hash;
  readonly controller_generation: string;
  readonly expected_revision: number;
  readonly validator_task_id: string;
  readonly validator_turn_id_at_dispatch: "unavailable";
  readonly turn_state: typeof UNAVAILABLE_AT_DISPATCH;
  readonly dispatch_provenance_path: string;
  readonly dispatch_provenance_sha256: Hash;
  readonly host_spawn_receipt_sha256: Hash;
  readonly work_packet_sha256: Hash;
  readonly validation_scope_sha256: Hash;
  readonly requested_model: string;
  readonly requested_reasoning: string;
  readonly actual_identity: string;
  readonly validator_profile_hash: Hash;
  readonly terminal_schema: string;
  readonly protected_effects: 0;
  readonly retry_count: 0;
  readonly descendant_count: 0;
  readonly observed_at_ms: number;
  readonly observed_elapsed_ms: number;
  readonly ack_content_sha256: Hash;
}

export interface ValidatorTerminal {
  readonly schema: typeof VALIDATOR_TERMINAL_SCHEMA;
  readonly event_kind: "VALIDATOR_TERMINAL";
  readonly binding_version: 1;
  readonly bead_id: string;
  readonly set_id: string;
  readonly validation_id: string;
  readonly effect_id: string;
  readonly idempotency_key: Hash;
  readonly controller_generation: string;
  readonly expected_revision: number;
  readonly dispatch_ack_content_sha256: Hash;
  readonly validator_task_id: string;
  readonly validator_turn_id: string;
  readonly turn_state: typeof BOUND_AT_TERMINAL;
  readonly host_terminal_receipt_path: string;
  readonly host_terminal_receipt_sha256: Hash;
  readonly terminal_packet_path: string;
  readonly terminal_packet_sha256: Hash;
  readonly terminal_packet_schema: string;
  readonly evidence_manifest_path: string;
  readonly evidence_manifest_sha256: Hash;
  readonly evidence_manifest_schema: string;
  readonly evidence_materialization_order:
    | "MANIFEST_BEFORE_TERMINAL"
    | "TERMINAL_BEFORE_MANIFEST_BEFORE_RECORD_RESULT";
  readonly evidence_digest: Hash;
  readonly verdict: string;
  readonly requested_model: string;
  readonly requested_reasoning: string;
  readonly actual_identity: string;
  readonly protected_effects: 0;
  readonly retry_count: 0;
  readonly descendant_count: 0;
  readonly observed_at_ms: number;
  readonly observed_elapsed_ms: number;
  readonly terminal_content_sha256: Hash;
}

export type ValidatorBindingStage = "DISPATCH_ACKED" | "TERMINAL_BOUND" | "RESULT_RECORDED";
export interface ValidatorBindingSidecar {
  readonly stage: ValidatorBindingStage;
  readonly validation_id: string;
  readonly effect_id: string;
  readonly controller_generation: string;
  readonly validator_task_id: string;
  readonly dispatch_ack_content_sha256: Hash;
  readonly validator_turn_id: string | null;
  readonly terminal_content_sha256: Hash | null;
  readonly terminal_packet_sha256: Hash | null;
  readonly evidence_manifest_sha256: Hash | null;
}

export interface ValidatorBindingContext {
  readonly bead_id: string;
  readonly set_id: string;
  readonly validation_id: string;
  readonly effect_id: string;
  readonly idempotency_key?: string;
  readonly controller_generation: string;
  readonly expected_revision: number;
  readonly validator_task_id: string;
  readonly work_packet_sha256: Hash;
  readonly validation_scope_sha256: Hash;
  readonly requested_model: string;
  readonly requested_reasoning: string;
  readonly actual_identity?: string;
  readonly validator_profile_hash: Hash;
  readonly terminal_schema: string;
  readonly dispatch_provenance_path: string;
  readonly dispatch_provenance_sha256: Hash;
  readonly host_spawn_receipt_sha256: Hash;
  readonly observed_at_ms?: number;
  readonly observed_elapsed_ms?: number;
}

export interface HostSpawnReceipt {
  readonly validator_task_id?: string;
  readonly task_id?: string;
  readonly host_task_id?: string;
  readonly host_spawn_receipt_sha256?: Hash;
  readonly receipt_sha256?: Hash;
}

export interface HostTerminalReceipt {
  readonly validator_task_id?: string;
  readonly task_id?: string;
  readonly host_task_id?: string;
  readonly validator_turn_id?: string;
  readonly turn_id?: string;
  readonly host_turn_id?: string;
  readonly host_terminal_receipt_sha256?: Hash;
  readonly receipt_sha256?: Hash;
  readonly terminal_packet_sha256?: Hash;
  readonly evidence_manifest_sha256?: Hash;
  readonly terminal_packet_path?: string;
  readonly evidence_manifest_path?: string;
}

export type ValidatorBindingErrorCode =
  | "ACK_TASK_ID_NOT_HOST_BOUND" | "ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH" | "ACK_WITH_VERDICT_OR_EVIDENCE"
  | "TERMINAL_BEFORE_ACK" | "TERMINAL_TASK_ID_MISMATCH" | "TERMINAL_TURN_NULL_OR_UNAVAILABLE"
  | "TERMINAL_VALIDATION_ID_MISMATCH" | "TERMINAL_EFFECT_OR_SET_MISMATCH" | "STALE_CONTROLLER_GENERATION"
  | "TERMINAL_PACKET_HASH_MISMATCH" | "MANIFEST_HASH_OR_ORDER_MISMATCH" | "POST_TERMINAL_UNDECLARED_EVIDENCE"
  | "CALLER_IDENTITY_SUBSTITUTION" | "ACK_IDEMPOTENCY_CONFLICT" | "TERMINAL_IDEMPOTENCY_CONFLICT"
  | "DUPLICATE_RECORD_RESULT" | "LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED"
  | "INVALID_ACK" | "INVALID_TERMINAL" | "INVALID_BINDING" | "UNRESERVED_EFFECT";

export class ValidatorBindingError extends Error {
  readonly code: ValidatorBindingErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
  constructor(code: ValidatorBindingErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ValidatorBindingError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function record(value: unknown): value is JsonRecord { return isPlainJsonObject(value); }
function exact(value: JsonRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, i) => key === expected[i]);
}
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function hash(value: unknown): value is Hash { return typeof value === "string" && SHA256.test(value); }
function integer(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }
function rejectUnknown(input: unknown, allowed: readonly string[], code: ValidatorBindingErrorCode): void {
  if (!record(input)) throw new ValidatorBindingError(code, "Validator event must be a plain object");
  const unknown = Object.keys(input).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    const evidence = unknown.some((key) => key === "verdict" || key.includes("evidence") || key.includes("terminal"));
    throw new ValidatorBindingError(evidence ? "ACK_WITH_VERDICT_OR_EVIDENCE" : code, "Validator event has undeclared fields", { unknown });
  }
}
function ackIdempotency(effectId: string, validationId: string, generation: string, taskId: string, packetHash: Hash): Hash {
  return sha256Hex(`${effectId}|${validationId}|${generation}|${taskId}|${packetHash}`);
}
function terminalIdempotency(ackHash: Hash, validationId: string, taskId: string, turnId: string, packetHash: Hash, manifestHash: Hash): Hash {
  return sha256Hex(`${ackHash}|${validationId}|${taskId}|${turnId}|${packetHash}|${manifestHash}`);
}
export const validatorAckIdempotencyKey = ackIdempotency;
export const validatorTerminalIdempotencyKey = terminalIdempotency;

function ackShape(value: unknown, requireHash: boolean): value is ValidatorDispatchAck {
  if (!record(value) || !exact(value, ACK_KEYS) || value.schema !== VALIDATOR_DISPATCH_ACK_SCHEMA
    || value.event_kind !== "VALIDATOR_DISPATCH_ACK" || value.binding_version !== 1 || !text(value.bead_id)
    || !text(value.set_id) || !text(value.validation_id) || !text(value.effect_id) || !hash(value.idempotency_key)
    || !text(value.controller_generation) || !integer(value.expected_revision) || !text(value.validator_task_id)
    || value.validator_turn_id_at_dispatch !== "unavailable" || value.turn_state !== UNAVAILABLE_AT_DISPATCH
    || !text(value.dispatch_provenance_path) || !hash(value.dispatch_provenance_sha256)
    || !hash(value.host_spawn_receipt_sha256) || !hash(value.work_packet_sha256) || !hash(value.validation_scope_sha256)
    || !text(value.requested_model) || !text(value.requested_reasoning) || !text(value.actual_identity)
    || !hash(value.validator_profile_hash) || !text(value.terminal_schema) || value.protected_effects !== 0
    || value.retry_count !== 0 || value.descendant_count !== 0 || !integer(value.observed_at_ms)
    || !integer(value.observed_elapsed_ms) || (requireHash && !hash(value.ack_content_sha256))) return false;
  return true;
}
function terminalShape(value: unknown, requireHash: boolean): value is ValidatorTerminal {
  if (!record(value) || !exact(value, TERMINAL_KEYS) || value.schema !== VALIDATOR_TERMINAL_SCHEMA
    || value.event_kind !== "VALIDATOR_TERMINAL" || value.binding_version !== 1 || !text(value.bead_id)
    || !text(value.set_id) || !text(value.validation_id) || !text(value.effect_id) || !hash(value.idempotency_key)
    || !text(value.controller_generation) || !integer(value.expected_revision) || !hash(value.dispatch_ack_content_sha256)
    || !text(value.validator_task_id) || !text(value.validator_turn_id)
    || ["unavailable", "null", "undefined"].includes(value.validator_turn_id.trim().toLowerCase())
    || value.turn_state !== BOUND_AT_TERMINAL || !text(value.host_terminal_receipt_path)
    || !hash(value.host_terminal_receipt_sha256) || !text(value.terminal_packet_path) || !hash(value.terminal_packet_sha256)
    || !text(value.terminal_packet_schema) || !text(value.evidence_manifest_path) || !hash(value.evidence_manifest_sha256)
    || !text(value.evidence_manifest_schema)
    || !["MANIFEST_BEFORE_TERMINAL", "TERMINAL_BEFORE_MANIFEST_BEFORE_RECORD_RESULT"].includes(String(value.evidence_materialization_order))
    || !hash(value.evidence_digest) || !text(value.verdict) || !text(value.requested_model)
    || !text(value.requested_reasoning) || !text(value.actual_identity) || value.protected_effects !== 0
    || value.retry_count !== 0 || value.descendant_count !== 0 || !integer(value.observed_at_ms)
    || !integer(value.observed_elapsed_ms) || (requireHash && !hash(value.terminal_content_sha256))) return false;
  return true;
}

export function verifyValidatorDispatchAck(value: unknown): value is ValidatorDispatchAck {
  try {
    return ackShape(value, true) && hashOmittingField(value, "ack_content_sha256") === value.ack_content_sha256
      && value.idempotency_key === ackIdempotency(value.effect_id, value.validation_id, value.controller_generation,
        value.validator_task_id, value.work_packet_sha256);
  } catch { return false; }
}
export function verifyValidatorTerminal(value: unknown): value is ValidatorTerminal {
  try {
    return terminalShape(value, true) && hashOmittingField(value, "terminal_content_sha256") === value.terminal_content_sha256
      && value.idempotency_key === terminalIdempotency(value.dispatch_ack_content_sha256, value.validation_id,
        value.validator_task_id, value.validator_turn_id, value.terminal_packet_sha256, value.evidence_manifest_sha256);
  } catch { return false; }
}
export const validateValidatorDispatchAck = verifyValidatorDispatchAck;
export const validateValidatorTerminal = verifyValidatorTerminal;

function createAckValue(input: Record<string, unknown>): ValidatorDispatchAck {
  rejectUnknown(input, ACK_KEYS.filter((key) => key !== "ack_content_sha256"), "INVALID_ACK");
  if (input.schema !== undefined && input.schema !== VALIDATOR_DISPATCH_ACK_SCHEMA) throw new ValidatorBindingError("INVALID_ACK", "ACK schema is fixed");
  if (input.binding_version !== undefined && input.binding_version !== 1) throw new ValidatorBindingError("INVALID_ACK", "ACK binding version is fixed");
  const base = {
    ...input, schema: VALIDATOR_DISPATCH_ACK_SCHEMA, event_kind: "VALIDATOR_DISPATCH_ACK" as const, binding_version: 1 as const,
    validator_turn_id_at_dispatch: "unavailable" as const, turn_state: UNAVAILABLE_AT_DISPATCH,
    protected_effects: 0 as const, retry_count: 0 as const, descendant_count: 0 as const,
    actual_identity: input.actual_identity ?? "unreported", observed_at_ms: input.observed_at_ms ?? 0,
    observed_elapsed_ms: input.observed_elapsed_ms ?? 0,
  };
  if (input.event_kind !== undefined && input.event_kind !== base.event_kind) throw new ValidatorBindingError("INVALID_ACK", "ACK event kind is fixed");
  if (input.validator_turn_id_at_dispatch !== undefined && input.validator_turn_id_at_dispatch !== "unavailable") {
    throw new ValidatorBindingError("ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH", "Dispatch ACK turn must be unavailable");
  }
  if (input.turn_state !== undefined && input.turn_state !== UNAVAILABLE_AT_DISPATCH) {
    throw new ValidatorBindingError("ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH", "Dispatch ACK turn state is invalid");
  }
  if (!ackShape({ ...base, ack_content_sha256: "0".repeat(64) }, false)) throw new ValidatorBindingError("INVALID_ACK", "Dispatch ACK fields are invalid");
  if (base.idempotency_key !== ackIdempotency(base.effect_id, base.validation_id, base.controller_generation,
    base.validator_task_id, base.work_packet_sha256)) throw new ValidatorBindingError("ACK_IDEMPOTENCY_CONFLICT", "Dispatch ACK idempotency key does not bind its fields");
  return withSelfHash(base, "ack_content_sha256") as unknown as ValidatorDispatchAck;
}
export function createValidatorDispatchAck(input: Omit<ValidatorDispatchAck, "ack_content_sha256"> & Partial<Pick<ValidatorDispatchAck, "ack_content_sha256">>): ValidatorDispatchAck {
  const value = createAckValue(input as unknown as Record<string, unknown>);
  if (!verifyValidatorDispatchAck(value)) throw new ValidatorBindingError("INVALID_ACK", "Dispatch ACK does not verify");
  return value;
}
export const makeValidatorDispatchAck = createValidatorDispatchAck;

function createTerminalValue(input: Record<string, unknown>): ValidatorTerminal {
  rejectUnknown(input, TERMINAL_KEYS.filter((key) => key !== "terminal_content_sha256"), "INVALID_TERMINAL");
  if (input.schema !== undefined && input.schema !== VALIDATOR_TERMINAL_SCHEMA) throw new ValidatorBindingError("INVALID_TERMINAL", "Terminal schema is fixed");
  if (input.binding_version !== undefined && input.binding_version !== 1) throw new ValidatorBindingError("INVALID_TERMINAL", "Terminal binding version is fixed");
  const base = {
    ...input, schema: VALIDATOR_TERMINAL_SCHEMA, event_kind: "VALIDATOR_TERMINAL" as const, binding_version: 1 as const,
    turn_state: BOUND_AT_TERMINAL, protected_effects: 0 as const, retry_count: 0 as const,
    descendant_count: 0 as const, actual_identity: input.actual_identity ?? "unreported",
    observed_at_ms: input.observed_at_ms ?? 0, observed_elapsed_ms: input.observed_elapsed_ms ?? 0,
  };
  if (input.event_kind !== undefined && input.event_kind !== base.event_kind) throw new ValidatorBindingError("INVALID_TERMINAL", "Terminal event kind is fixed");
  if (typeof input.validator_turn_id === "string"
    && ["unavailable", "null", "undefined"].includes(input.validator_turn_id.trim().toLowerCase())) {
    throw new ValidatorBindingError("TERMINAL_TURN_NULL_OR_UNAVAILABLE", "Terminal turn must be concrete host evidence");
  }
  if (!terminalShape({ ...base, terminal_content_sha256: "0".repeat(64) }, false)) throw new ValidatorBindingError("INVALID_TERMINAL", "Terminal fields are invalid");
  if (base.idempotency_key !== terminalIdempotency(base.dispatch_ack_content_sha256, base.validation_id,
    base.validator_task_id, base.validator_turn_id, base.terminal_packet_sha256, base.evidence_manifest_sha256)) {
    throw new ValidatorBindingError("TERMINAL_IDEMPOTENCY_CONFLICT", "Terminal idempotency key does not bind its fields");
  }
  return withSelfHash(base, "terminal_content_sha256") as unknown as ValidatorTerminal;
}
export function createValidatorTerminal(input: Omit<ValidatorTerminal, "terminal_content_sha256"> & Partial<Pick<ValidatorTerminal, "terminal_content_sha256">>): ValidatorTerminal {
  const value = createTerminalValue(input as unknown as Record<string, unknown>);
  if (!verifyValidatorTerminal(value)) throw new ValidatorBindingError("INVALID_TERMINAL", "Terminal does not verify");
  return value;
}
export const makeValidatorTerminal = createValidatorTerminal;

export function evidenceDigest(entries: readonly { path: string; sha256: Hash; bytes: number; role: string }[]): Hash {
  if (!Array.isArray(entries) || entries.length === 0 || entries.some((entry) => !record(entry)
    || !text(entry.path) || !hash(entry.sha256) || !integer(entry.bytes) || !text(entry.role))) {
    throw new ValidatorBindingError("MANIFEST_HASH_OR_ORDER_MISMATCH", "Evidence manifest entries are invalid");
  }
  return canonicalSha256(entries);
}
export const computeEvidenceDigest = evidenceDigest;

function taskId(receipt: HostSpawnReceipt | HostTerminalReceipt): string | undefined {
  return receipt.validator_task_id ?? receipt.task_id ?? receipt.host_task_id;
}
function turnId(receipt: HostTerminalReceipt): string | undefined {
  return receipt.validator_turn_id ?? receipt.turn_id ?? receipt.host_turn_id;
}
function receiptHash(receipt: HostSpawnReceipt | HostTerminalReceipt, terminal: boolean): Hash | undefined {
  const value = receipt as Record<string, unknown>;
  return (terminal ? value.host_terminal_receipt_sha256 : value.host_spawn_receipt_sha256) as Hash | undefined
    ?? value.receipt_sha256 as Hash | undefined;
}
function sidecar(stage: ValidatorBindingStage, ack: ValidatorDispatchAck, terminal?: ValidatorTerminal): ValidatorBindingSidecar {
  return {
    stage, validation_id: ack.validation_id, effect_id: ack.effect_id, controller_generation: ack.controller_generation,
    validator_task_id: ack.validator_task_id, dispatch_ack_content_sha256: ack.ack_content_sha256,
    validator_turn_id: terminal?.validator_turn_id ?? null, terminal_content_sha256: terminal?.terminal_content_sha256 ?? null,
    terminal_packet_sha256: terminal?.terminal_packet_sha256 ?? null, evidence_manifest_sha256: terminal?.evidence_manifest_sha256 ?? null,
  };
}
export function verifyValidatorBindingSidecar(value: unknown): value is ValidatorBindingSidecar {
  if (!record(value)) return false;
  if (!exact(value, SIDEcar_KEYS)) return false;
  const stage = String(value.stage);
  const dispatchOnly = stage === "DISPATCH_ACKED" && value.validator_turn_id === null
    && value.terminal_content_sha256 === null && value.terminal_packet_sha256 === null && value.evidence_manifest_sha256 === null;
  const terminalBound = (stage === "TERMINAL_BOUND" || stage === "RESULT_RECORDED")
    && text(value.validator_turn_id) && hash(value.terminal_content_sha256)
    && hash(value.terminal_packet_sha256) && hash(value.evidence_manifest_sha256);
  return ["DISPATCH_ACKED", "TERMINAL_BOUND", "RESULT_RECORDED"].includes(stage)
    && text(value.validation_id) && text(value.effect_id) && text(value.controller_generation) && text(value.validator_task_id)
    && hash(value.dispatch_ack_content_sha256)
    && (value.validator_turn_id === null || text(value.validator_turn_id))
    && (value.terminal_content_sha256 === null || hash(value.terminal_content_sha256))
    && (value.terminal_packet_sha256 === null || hash(value.terminal_packet_sha256))
    && (dispatchOnly || terminalBound);
}
export const validateValidatorBindingSidecar = verifyValidatorBindingSidecar;
export function validatorBindingFromAck(ack: ValidatorDispatchAck): ValidatorBindingSidecar {
  if (!verifyValidatorDispatchAck(ack)) throw new ValidatorBindingError("INVALID_ACK", "Dispatch ACK is not verified");
  return sidecar("DISPATCH_ACKED", ack);
}

export interface ValidatorDispatchAcceptance {
  readonly context: ValidatorBindingContext;
  readonly ack: ValidatorDispatchAck;
  readonly host_spawn_receipt: HostSpawnReceipt;
  readonly existing?: ValidatorBindingSidecar | null;
}
export interface ValidatorDispatchAcceptanceResult { readonly binding: ValidatorBindingSidecar; readonly replayed: boolean; readonly ack: ValidatorDispatchAck; }
export function acceptValidatorDispatchAck(input: ValidatorDispatchAcceptance): ValidatorDispatchAcceptanceResult {
  const { context, ack, host_spawn_receipt: receipt, existing = null } = input;
  if (!verifyValidatorDispatchAck(ack)) throw new ValidatorBindingError("INVALID_ACK", "Dispatch ACK is not verified");
  if (context.actual_identity !== undefined && ack.actual_identity !== context.actual_identity) {
    throw new ValidatorBindingError("CALLER_IDENTITY_SUBSTITUTION", "Dispatch ACK identity is not host-bound");
  }
  if (ack.controller_generation !== context.controller_generation) {
    throw new ValidatorBindingError("STALE_CONTROLLER_GENERATION", "Dispatch ACK controller generation is stale");
  }
  const hostTask = taskId(receipt);
  if (!hostTask || ack.validator_task_id !== hostTask || ack.validator_task_id !== context.validator_task_id) {
    throw new ValidatorBindingError("ACK_TASK_ID_NOT_HOST_BOUND", "Dispatch ACK task is not host-bound");
  }
  if (ack.validator_turn_id_at_dispatch !== "unavailable" || ack.turn_state !== UNAVAILABLE_AT_DISPATCH) {
    throw new ValidatorBindingError("ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH", "Dispatch ACK turn is not unavailable");
  }
  const receiptSha = receiptHash(receipt, false);
  if (receiptSha && ack.host_spawn_receipt_sha256 !== receiptSha) throw new ValidatorBindingError("ACK_IDEMPOTENCY_CONFLICT", "Dispatch receipt hash mismatch");
  for (const [key, expected] of Object.entries(context)) {
    if (key === "idempotency_key" || key === "actual_identity" || key === "observed_at_ms" || key === "observed_elapsed_ms") continue;
    if (key in ack && (ack as unknown as JsonRecord)[key] !== expected) throw new ValidatorBindingError("ACK_IDEMPOTENCY_CONFLICT", `Dispatch ACK ${key} does not match durable binding`);
  }
  if (ack.idempotency_key !== ackIdempotency(ack.effect_id, ack.validation_id, ack.controller_generation, ack.validator_task_id, ack.work_packet_sha256)) {
    throw new ValidatorBindingError("ACK_IDEMPOTENCY_CONFLICT", "Dispatch ACK idempotency key does not bind its fields");
  }
  if (existing) {
    if (!verifyValidatorBindingSidecar(existing) || existing.dispatch_ack_content_sha256 !== ack.ack_content_sha256) {
      throw new ValidatorBindingError("ACK_IDEMPOTENCY_CONFLICT", "Dispatch ACK conflicts with existing binding");
    }
    return { binding: existing, replayed: true, ack };
  }
  return { binding: validatorBindingFromAck(ack), replayed: false, ack };
}

export interface ValidatorTerminalAcceptance {
  readonly context: ValidatorBindingContext;
  readonly ack: ValidatorDispatchAck;
  readonly terminal: ValidatorTerminal;
  readonly host_terminal_receipt: HostTerminalReceipt;
  readonly existing?: ValidatorBindingSidecar | null;
}
export interface ValidatorTerminalAcceptanceResult { readonly binding: ValidatorBindingSidecar; readonly replayed: boolean; readonly terminal: ValidatorTerminal; }
export function acceptValidatorTerminal(input: ValidatorTerminalAcceptance): ValidatorTerminalAcceptanceResult {
  const { context, ack, terminal, host_terminal_receipt: receipt, existing = null } = input;
  if (!verifyValidatorDispatchAck(ack)) throw new ValidatorBindingError("TERMINAL_BEFORE_ACK", "Terminal ACK is not verified");
  if (!verifyValidatorTerminal(terminal)) throw new ValidatorBindingError("INVALID_TERMINAL", "Terminal is not verified");
  if (context.actual_identity !== undefined && terminal.actual_identity !== context.actual_identity) throw new ValidatorBindingError("CALLER_IDENTITY_SUBSTITUTION", "Terminal identity is not host-bound");
  if (ack.controller_generation !== context.controller_generation || terminal.controller_generation !== context.controller_generation) throw new ValidatorBindingError("STALE_CONTROLLER_GENERATION", "Terminal controller generation is stale");
  if (!existing || !verifyValidatorBindingSidecar(existing) || existing.stage === "RESULT_RECORDED") {
    if (existing?.stage === "RESULT_RECORDED") throw new ValidatorBindingError("POST_TERMINAL_UNDECLARED_EVIDENCE", "Terminal arrived after result recording");
    throw new ValidatorBindingError("TERMINAL_BEFORE_ACK", "Terminal requires one matching dispatch ACK");
  }
  if (existing.stage === "TERMINAL_BOUND") {
    if (existing.terminal_content_sha256 === terminal.terminal_content_sha256 && existing.terminal_packet_sha256 === terminal.terminal_packet_sha256
      && existing.evidence_manifest_sha256 === terminal.evidence_manifest_sha256) return { binding: existing, replayed: true, terminal };
    throw new ValidatorBindingError("TERMINAL_IDEMPOTENCY_CONFLICT", "A second terminal conflicts with the bound terminal");
  }
  if (existing.dispatch_ack_content_sha256 !== ack.ack_content_sha256
    || existing.validation_id !== ack.validation_id || existing.effect_id !== ack.effect_id
    || existing.controller_generation !== ack.controller_generation || existing.validator_task_id !== ack.validator_task_id) {
    throw new ValidatorBindingError("TERMINAL_EFFECT_OR_SET_MISMATCH", "Terminal ACK sidecar does not match the ACK");
  }
  const hostTask = taskId(receipt);
  const hostTurn = turnId(receipt);
  if (!hostTask || hostTask !== ack.validator_task_id || terminal.validator_task_id !== ack.validator_task_id) {
    throw new ValidatorBindingError("TERMINAL_TASK_ID_MISMATCH", "Terminal task does not match the ACK host task");
  }
  if (!hostTurn || hostTurn === "unavailable" || hostTurn === "null" || terminal.validator_turn_id !== hostTurn) {
    throw new ValidatorBindingError("TERMINAL_TURN_NULL_OR_UNAVAILABLE", "Terminal turn is not concrete host evidence");
  }
  if (terminal.validation_id !== ack.validation_id || terminal.validation_id !== context.validation_id) {
    throw new ValidatorBindingError("TERMINAL_VALIDATION_ID_MISMATCH", "Terminal validation id does not match the ACK");
  }
  if (terminal.effect_id !== ack.effect_id || terminal.set_id !== ack.set_id || terminal.bead_id !== ack.bead_id
    || terminal.controller_generation !== ack.controller_generation || terminal.dispatch_ack_content_sha256 !== ack.ack_content_sha256) {
    throw new ValidatorBindingError("TERMINAL_EFFECT_OR_SET_MISMATCH", "Terminal identifiers do not match the ACK");
  }
  const receiptSha = receiptHash(receipt, true);
  if (!receiptSha || terminal.host_terminal_receipt_sha256 !== receiptSha) throw new ValidatorBindingError("TERMINAL_PACKET_HASH_MISMATCH", "Terminal host receipt hash is not bound");
  if (receipt.terminal_packet_sha256 && receipt.terminal_packet_sha256 !== terminal.terminal_packet_sha256) throw new ValidatorBindingError("TERMINAL_PACKET_HASH_MISMATCH", "Terminal packet hash is not bound");
  if (receipt.evidence_manifest_sha256 && receipt.evidence_manifest_sha256 !== terminal.evidence_manifest_sha256) throw new ValidatorBindingError("MANIFEST_HASH_OR_ORDER_MISMATCH", "Evidence manifest hash is not bound");
  if (receipt.terminal_packet_path && receipt.terminal_packet_path !== terminal.terminal_packet_path) throw new ValidatorBindingError("TERMINAL_PACKET_HASH_MISMATCH", "Terminal packet path is not bound");
  if (receipt.evidence_manifest_path && receipt.evidence_manifest_path !== terminal.evidence_manifest_path) throw new ValidatorBindingError("MANIFEST_HASH_OR_ORDER_MISMATCH", "Evidence manifest path is not bound");
  if (terminal.idempotency_key !== terminalIdempotency(terminal.dispatch_ack_content_sha256, terminal.validation_id,
    terminal.validator_task_id, terminal.validator_turn_id, terminal.terminal_packet_sha256, terminal.evidence_manifest_sha256)) {
    throw new ValidatorBindingError("TERMINAL_IDEMPOTENCY_CONFLICT", "Terminal idempotency key does not bind its fields");
  }
  return { binding: sidecar("TERMINAL_BOUND", ack, terminal), replayed: false, terminal };
}

export interface ValidatorResultAcceptance {
  readonly binding: ValidatorBindingSidecar;
  readonly terminal: ValidatorTerminal;
  readonly verdict: string;
}
export interface ValidatorResultAcceptanceResult { readonly binding: ValidatorBindingSidecar; readonly replayed: boolean; }
export function recordValidatorResult(input: ValidatorResultAcceptance): ValidatorResultAcceptanceResult {
  const { binding, terminal, verdict } = input;
  if (!verifyValidatorBindingSidecar(binding) || binding.stage !== "TERMINAL_BOUND" && binding.stage !== "RESULT_RECORDED") {
    throw new ValidatorBindingError("TERMINAL_BEFORE_ACK", "Result requires a bound terminal");
  }
  if (!verifyValidatorTerminal(terminal) || terminal.terminal_content_sha256 !== binding.terminal_content_sha256
    || terminal.evidence_manifest_sha256 !== binding.evidence_manifest_sha256 || terminal.verdict !== verdict) {
    throw new ValidatorBindingError(binding.stage === "RESULT_RECORDED" ? "DUPLICATE_RECORD_RESULT" : "POST_TERMINAL_UNDECLARED_EVIDENCE", "Result is not bound to the terminal");
  }
  if (binding.stage === "RESULT_RECORDED") {
    if (binding.result_verdict !== verdict) throw new ValidatorBindingError("DUPLICATE_RECORD_RESULT", "Conflicting duplicate result");
    return { binding, replayed: true };
  }
  return { binding: { ...binding, stage: "RESULT_RECORDED" }, replayed: false };
}

export const bindValidatorDispatchAck = acceptValidatorDispatchAck;
export const bindValidatorTerminal = acceptValidatorTerminal;
export const applyValidatorDispatchAck = acceptValidatorDispatchAck;
export const applyValidatorTerminal = acceptValidatorTerminal;
