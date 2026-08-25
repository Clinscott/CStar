import { canonicalJson, canonicalSha256, hashOmittingField, isPlainJsonObject, sha256Hex, withSelfHash } from "./canonical.js";
import { verifyOutboxRecord, type EffectOutboxRecord } from "./effects.js";
import { validateClosedObject, V0_SCHEMA_DECLARATIONS } from "./schemas.js";
import { verifySetRecord, type SetRecord } from "./work_packets.js";

export const VALIDATOR_DISPATCH_ACK_SCHEMA = "corvus.validator_dispatch_ack.v1" as const;
export const VALIDATOR_TERMINAL_SCHEMA = "corvus.validator_terminal.v1" as const;
export const VALIDATOR_BINDING_VERSION = 1 as const;
export const UNAVAILABLE_AT_DISPATCH = "UNAVAILABLE_AT_DISPATCH" as const;
export const BOUND_AT_TERMINAL = "BOUND_AT_TERMINAL" as const;
export const MANIFEST_BEFORE_TERMINAL = "MANIFEST_BEFORE_TERMINAL" as const;
export const TERMINAL_BEFORE_MANIFEST_BEFORE_RECORD_RESULT = "TERMINAL_BEFORE_MANIFEST_BEFORE_RECORD_RESULT" as const;
type Hash = string; type JsonRecord = Record<string, unknown>;
const SHA256 = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ACK_KEYS = V0_SCHEMA_DECLARATIONS[VALIDATOR_DISPATCH_ACK_SCHEMA].required;
const TERMINAL_KEYS = V0_SCHEMA_DECLARATIONS[VALIDATOR_TERMINAL_SCHEMA].required;
export type ValidatorBindingErrorCode = "ACK_TASK_ID_NOT_HOST_BOUND" | "ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH" | "ACK_WITH_VERDICT_OR_EVIDENCE" | "TERMINAL_BEFORE_ACK" | "TERMINAL_TASK_ID_MISMATCH" | "TERMINAL_TURN_NULL_OR_UNAVAILABLE" | "TERMINAL_VALIDATION_ID_MISMATCH" | "TERMINAL_EFFECT_OR_SET_MISMATCH" | "STALE_CONTROLLER_GENERATION" | "TERMINAL_PACKET_HASH_MISMATCH" | "MANIFEST_HASH_OR_ORDER_MISMATCH" | "POST_TERMINAL_UNDECLARED_EVIDENCE" | "CALLER_IDENTITY_SUBSTITUTION" | "ACK_IDEMPOTENCY_CONFLICT" | "TERMINAL_IDEMPOTENCY_CONFLICT" | "VALIDATOR_TERMINAL_CONFLICT" | "DUPLICATE_RECORD_RESULT" | "RESULT_DUPLICATE_CONFLICT" | "LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED" | "INVALID_VALIDATOR_BINDING" | "INVALID_VALIDATOR_EVENT";

export class ValidatorBindingError extends Error { readonly code: ValidatorBindingErrorCode; readonly details: Readonly<Record<string, unknown>>; constructor(code: ValidatorBindingErrorCode, message: string, details: Record<string, unknown> = {}) { super(message); this.name = "ValidatorBindingError"; this.code = code; this.details = Object.freeze({ ...details }); } }

export interface ValidatorDispatchAck { readonly schema: typeof VALIDATOR_DISPATCH_ACK_SCHEMA; readonly event_kind: "VALIDATOR_DISPATCH_ACK"; readonly binding_version: 1; readonly bead_id: string; readonly set_id: string; readonly validation_id: string; readonly effect_id: string; readonly idempotency_key: string; readonly controller_generation: string; readonly expected_revision: number; readonly validator_task_id: string; readonly validator_turn_id_at_dispatch: "unavailable"; readonly turn_state: typeof UNAVAILABLE_AT_DISPATCH; readonly dispatch_provenance_path: string; readonly dispatch_provenance_sha256: Hash; readonly host_spawn_receipt_sha256: Hash; readonly work_packet_sha256: Hash; readonly validation_scope_sha256: Hash; readonly requested_model: string; readonly requested_reasoning: string; readonly actual_identity: string; readonly validator_profile_hash: Hash; readonly terminal_schema: string; readonly protected_effects: 0; readonly retry_count: 0; readonly descendant_count: 0; readonly observed_at_ms: number; readonly observed_elapsed_ms: number; readonly ack_content_sha256: Hash; }

export interface ValidatorTerminal { readonly schema: typeof VALIDATOR_TERMINAL_SCHEMA; readonly event_kind: "VALIDATOR_TERMINAL"; readonly binding_version: 1; readonly bead_id: string; readonly set_id: string; readonly validation_id: string; readonly effect_id: string; readonly idempotency_key: string; readonly controller_generation: string; readonly expected_revision: number; readonly dispatch_ack_content_sha256: Hash; readonly validator_task_id: string; readonly validator_turn_id: string; readonly turn_state: typeof BOUND_AT_TERMINAL; readonly host_terminal_receipt_path: string; readonly host_terminal_receipt_sha256: Hash; readonly terminal_packet_path: string; readonly terminal_packet_sha256: Hash; readonly terminal_packet_schema: string; readonly evidence_manifest_path: string; readonly evidence_manifest_sha256: Hash; readonly evidence_manifest_schema: string; readonly evidence_materialization_order: typeof MANIFEST_BEFORE_TERMINAL | typeof TERMINAL_BEFORE_MANIFEST_BEFORE_RECORD_RESULT; readonly evidence_digest: Hash; readonly verdict: string; readonly requested_model: string; readonly requested_reasoning: string; readonly actual_identity: string; readonly protected_effects: 0; readonly retry_count: 0; readonly descendant_count: 0; readonly observed_at_ms: number; readonly observed_elapsed_ms: number; readonly terminal_content_sha256: Hash; }

export interface HostSpawnReceipt extends JsonRecord { readonly validator_task_id?: string; readonly task_id?: string; readonly host_task_id?: string; readonly effect_id?: string; readonly idempotency_key?: string; readonly controller_generation?: string; readonly actual_identity?: string; }

export interface HostTerminalReceipt extends JsonRecord { readonly validator_task_id?: string; readonly task_id?: string; readonly host_task_id?: string; readonly validator_turn_id?: string; readonly turn_id?: string; readonly host_turn_id?: string; readonly effect_id?: string; readonly idempotency_key?: string; readonly controller_generation?: string; readonly actual_identity?: string; }

export interface ValidatorEffectBinding { readonly effect: EffectOutboxRecord; readonly set_record: SetRecord; readonly validation_id: string; readonly validation_scope_sha256: Hash; readonly work_packet_sha256: Hash; readonly validator_profile_hash: Hash; readonly terminal_schema?: string; /** This identity is persisted with the reserved validator effect sidecar. */ readonly validator_task_id: string; }

export interface ValidatorDispatchAckInput { readonly binding: ValidatorEffectBinding; readonly host_spawn_receipt: HostSpawnReceipt; readonly dispatch_provenance_path: string; readonly dispatch_provenance_sha256: Hash; readonly host_spawn_receipt_sha256?: Hash; readonly observed_at_ms?: number; readonly observed_elapsed_ms?: number; }

export interface EvidenceManifestEntry { readonly path: string; readonly sha256: Hash; readonly bytes: number; readonly role: string; }

export interface ValidatorTerminalInput { readonly ack: ValidatorDispatchAck; readonly binding: ValidatorEffectBinding; readonly host_terminal_receipt: HostTerminalReceipt; readonly terminal_packet: unknown; readonly evidence_manifest: unknown; readonly host_terminal_receipt_path: string; readonly terminal_packet_path: string; readonly evidence_manifest_path: string; readonly host_terminal_receipt_sha256?: Hash; readonly terminal_packet_sha256?: Hash; readonly evidence_manifest_sha256?: Hash; readonly terminal_packet_schema?: string; readonly evidence_manifest_schema?: string; readonly evidence_materialization_order?: typeof MANIFEST_BEFORE_TERMINAL | typeof TERMINAL_BEFORE_MANIFEST_BEFORE_RECORD_RESULT; readonly verdict: string; readonly observed_at_ms?: number; readonly observed_elapsed_ms?: number; }
function record(value: unknown): value is JsonRecord { return isPlainJsonObject(value); }
function exactKeys(value: JsonRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, i) => key === expected[i]);
}
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function hash(value: unknown): value is Hash { return typeof value === "string" && SHA256.test(value); }
function number(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function fail(code: ValidatorBindingErrorCode, message: string, details: Record<string, unknown> = {}): never {
  throw new ValidatorBindingError(code, message, details);
}
function requireText(value: unknown, code = "INVALID_VALIDATOR_BINDING" as ValidatorBindingErrorCode): string {
  if (!text(value)) fail(code, "A non-empty string is required");
  return value;
}
function requireHash(value: unknown, code = "INVALID_VALIDATOR_BINDING" as ValidatorBindingErrorCode): Hash {
  if (!hash(value)) fail(code, "A lower-case SHA-256 hash is required");
  return value;
}
function canonicalHash(value: unknown, code = "INVALID_VALIDATOR_BINDING" as ValidatorBindingErrorCode): Hash {
  try { return canonicalSha256(value); } catch (error) {
    fail(code, "Value is not canonical JSON", { cause: String(error) });
  }
}
function same(a: unknown, b: unknown): boolean {
  try { return canonicalSha256(a) === canonicalSha256(b); } catch { return false; }
}
function idempotency(parts: readonly string[]): string { return sha256Hex(parts.join("|")); }

export function deriveValidatorAckIdempotencyKey(input: {
  readonly effect_id: string; readonly validation_id: string; readonly controller_generation: string;
  readonly validator_task_id: string; readonly work_packet_sha256: Hash;
}): Hash {
  return idempotency([input.effect_id, input.validation_id, input.controller_generation,
    input.validator_task_id, input.work_packet_sha256]);
}
export const deriveAckIdempotencyKey = deriveValidatorAckIdempotencyKey;

export function deriveValidatorTerminalIdempotencyKey(input: {
  readonly dispatch_ack_content_sha256: Hash; readonly validation_id: string; readonly validator_task_id: string;
  readonly validator_turn_id: string; readonly terminal_packet_sha256: Hash; readonly evidence_manifest_sha256: Hash;
}): Hash {
  return idempotency([input.dispatch_ack_content_sha256, input.validation_id, input.validator_task_id,
    input.validator_turn_id, input.terminal_packet_sha256, input.evidence_manifest_sha256]);
}
export const deriveTerminalIdempotencyKey = deriveValidatorTerminalIdempotencyKey;

function hostTask(receipt: HostSpawnReceipt | HostTerminalReceipt): string {
  const candidate = receipt.validator_task_id ?? receipt.host_task_id ?? receipt.task_id;
  if (!text(candidate) || candidate === "unavailable" || candidate === "null") {
    fail("ACK_TASK_ID_NOT_HOST_BOUND", "Host spawn evidence does not contain a concrete task identity");
  }
  return candidate;
}
function hostTurn(receipt: HostTerminalReceipt): string {
  const candidate = receipt.validator_turn_id ?? receipt.host_turn_id ?? receipt.turn_id;
  if (!text(candidate) || candidate === "unavailable" || !UUID.test(candidate)) {
    fail("TERMINAL_TURN_NULL_OR_UNAVAILABLE", "Host terminal evidence does not contain a concrete UUID turn");
  }
  return candidate;
}
function receiptHash(receipt: JsonRecord, supplied: Hash | undefined): Hash {
  const computed = canonicalHash(receipt);
  if (supplied !== undefined && (!hash(supplied) || supplied !== computed)) {
    fail("INVALID_VALIDATOR_BINDING", "Receipt hash does not bind receipt bytes");
  }
  return supplied ?? computed;
}
function bindingParts(binding: ValidatorEffectBinding, task: string) {
  const effect = binding.effect;
  if (!verifyOutboxRecord(effect) || effect.status !== "RESERVED") {
    fail("INVALID_VALIDATOR_BINDING", "A reserved, verified validator effect is required");
  }
  if (!verifySetRecord(binding.set_record) || effect.set_id !== binding.set_record.set_id
    || effect.controller_generation !== binding.set_record.controller_generation) {
    fail("TERMINAL_EFFECT_OR_SET_MISMATCH", "Effect and SET are not the same durable binding");
  }
  requireText(binding.validation_id);
  requireHash(binding.validation_scope_sha256);
  requireHash(binding.work_packet_sha256);
  requireHash(binding.validator_profile_hash);
  if (!text(binding.validator_task_id) || binding.validator_task_id !== task) {
    fail("ACK_TASK_ID_NOT_HOST_BOUND", "Caller task identity differs from host spawn evidence");
  }
  return {
    bead_id: binding.set_record.bead_id,
    set_id: binding.set_record.set_id,
    validation_id: binding.validation_id,
    effect_id: effect.effect_id,
    controller_generation: effect.controller_generation,
    expected_revision: effect.expected_state_revision,
    work_packet_sha256: binding.work_packet_sha256,
    validation_scope_sha256: binding.validation_scope_sha256,
    requested_model: binding.set_record.requested_model,
    requested_reasoning: binding.set_record.requested_reasoning,
    validator_profile_hash: binding.validator_profile_hash,
    terminal_schema: binding.terminal_schema ?? binding.set_record.terminal_schema,
  };
}

function ackShape(value: unknown): value is ValidatorDispatchAck {
  if (!record(value) || !exactKeys(value, ACK_KEYS) || value.schema !== VALIDATOR_DISPATCH_ACK_SCHEMA
    || value.event_kind !== "VALIDATOR_DISPATCH_ACK" || value.binding_version !== 1
    || value.turn_state !== UNAVAILABLE_AT_DISPATCH || value.validator_turn_id_at_dispatch !== "unavailable"
    || value.protected_effects !== 0 || value.retry_count !== 0 || value.descendant_count !== 0
    || !text(value.bead_id) || !text(value.set_id) || !text(value.validation_id) || !text(value.effect_id)
    || !hash(value.idempotency_key) || !text(value.controller_generation) || !number(value.expected_revision)
    || !text(value.validator_task_id) || value.validator_task_id === "unavailable"
    || !text(value.dispatch_provenance_path) || !hash(value.dispatch_provenance_sha256)
    || !hash(value.host_spawn_receipt_sha256) || !hash(value.work_packet_sha256)
    || !hash(value.validation_scope_sha256) || !text(value.requested_model)
    || !text(value.requested_reasoning) || !text(value.actual_identity) || !hash(value.validator_profile_hash)
    || !text(value.terminal_schema) || !number(value.observed_at_ms) || !number(value.observed_elapsed_ms)
    || !hash(value.ack_content_sha256)) return false;
  try { return value.idempotency_key === deriveValidatorAckIdempotencyKey(value as unknown as Parameters<typeof deriveValidatorAckIdempotencyKey>[0])
      && hashOmittingField(value, "ack_content_sha256") === value.ack_content_sha256; } catch { return false; }
}

function terminalShape(value: unknown): value is ValidatorTerminal {
  if (!record(value) || !exactKeys(value, TERMINAL_KEYS) || value.schema !== VALIDATOR_TERMINAL_SCHEMA
    || value.event_kind !== "VALIDATOR_TERMINAL" || value.binding_version !== 1
    || value.turn_state !== BOUND_AT_TERMINAL || value.protected_effects !== 0
    || value.retry_count !== 0 || value.descendant_count !== 0 || !text(value.bead_id)
    || !text(value.set_id) || !text(value.validation_id) || !text(value.effect_id)
    || !hash(value.idempotency_key) || !text(value.controller_generation)
    || !number(value.expected_revision) || !hash(value.dispatch_ack_content_sha256)
    || !text(value.validator_task_id) || !UUID.test(value.validator_turn_id)
    || !text(value.host_terminal_receipt_path) || !hash(value.host_terminal_receipt_sha256)
    || !text(value.terminal_packet_path) || !hash(value.terminal_packet_sha256)
    || !text(value.terminal_packet_schema) || !text(value.evidence_manifest_path)
    || !hash(value.evidence_manifest_sha256) || !text(value.evidence_manifest_schema)
    || ![MANIFEST_BEFORE_TERMINAL, TERMINAL_BEFORE_MANIFEST_BEFORE_RECORD_RESULT].includes(
      value.evidence_materialization_order as typeof MANIFEST_BEFORE_TERMINAL)
    || !hash(value.evidence_digest) || !text(value.verdict) || !text(value.requested_model)
    || !text(value.requested_reasoning) || !text(value.actual_identity) || !number(value.observed_at_ms)
    || !number(value.observed_elapsed_ms) || !hash(value.terminal_content_sha256)) return false;
  try {
    return value.idempotency_key === deriveValidatorTerminalIdempotencyKey(value as unknown as Parameters<typeof deriveValidatorTerminalIdempotencyKey>[0])
      && hashOmittingField(value, "terminal_content_sha256") === value.terminal_content_sha256;
  } catch { return false; }
}

function validateAckEvent(value: unknown): asserts value is ValidatorDispatchAck {
  if (record(value)) {
    if (Object.prototype.hasOwnProperty.call(value, "validator_turn_id_at_dispatch")
      && value.validator_turn_id_at_dispatch !== "unavailable") fail("ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH", "ACK dispatch turn must be unavailable");
    if (["verdict", "evidence_manifest", "evidence_digest", "terminal_packet_sha256"].some((key) => Object.hasOwn(value, key))) {
      fail("ACK_WITH_VERDICT_OR_EVIDENCE", "ACK cannot carry terminal or evidence material");
    }
  }
  const result = validateClosedObject(value, VALIDATOR_DISPATCH_ACK_SCHEMA);
  if (!result.valid || !ackShape(value)) fail("INVALID_VALIDATOR_EVENT", "ACK is not a verified closed event", { issues: result.issues });
}
function validateTerminalEvent(value: unknown): asserts value is ValidatorTerminal {
  const result = validateClosedObject(value, VALIDATOR_TERMINAL_SCHEMA);
  if (!result.valid || !terminalShape(value)) fail("INVALID_VALIDATOR_EVENT", "Terminal is not a verified closed event", { issues: result.issues });
}
export function verifyValidatorDispatchAck(value: unknown): value is ValidatorDispatchAck {
  try { return ackShape(value); } catch { return false; }
}
export function verifyValidatorTerminal(value: unknown): value is ValidatorTerminal {
  try { return terminalShape(value); } catch { return false; }
}
export const validateValidatorDispatchAck = verifyValidatorDispatchAck;
export const validateValidatorTerminal = verifyValidatorTerminal;
export function assertValidatorDispatchAck(value: unknown): asserts value is ValidatorDispatchAck { validateAckEvent(value); }
export function assertValidatorTerminal(value: unknown): asserts value is ValidatorTerminal { validateTerminalEvent(value); }

function ackBase(input: ValidatorDispatchAckInput): JsonRecord {
  if (record(input) && Object.hasOwn(input, "actual_identity")) fail("CALLER_IDENTITY_SUBSTITUTION", "Identity must come from host spawn evidence");
  if (!record(input) || Object.keys(input).some((key) => ![
    "binding", "host_spawn_receipt", "dispatch_provenance_path", "dispatch_provenance_sha256",
    "host_spawn_receipt_sha256", "observed_at_ms", "observed_elapsed_ms",
  ].includes(key))) fail("ACK_WITH_VERDICT_OR_EVIDENCE", "ACK input contains terminal or evidence material");
  const receipt = input.host_spawn_receipt;
  const task = hostTask(receipt);
  const parts = bindingParts(input.binding, task);
  if (receipt.effect_id !== undefined && receipt.effect_id !== parts.effect_id) {
    fail("ACK_TASK_ID_NOT_HOST_BOUND", "Host spawn effect does not match the reserved effect");
  }
  if (receipt.idempotency_key !== undefined && receipt.idempotency_key !== input.binding.effect.idempotency_key) {
    fail("ACK_TASK_ID_NOT_HOST_BOUND", "Host spawn idempotency key does not match the reserved effect");
  }
  if ((receipt.controller_generation !== undefined && receipt.controller_generation !== parts.controller_generation)
    || (receipt.actual_identity !== undefined && !text(receipt.actual_identity))) fail("CALLER_IDENTITY_SUBSTITUTION", "Host spawn receipt identity or generation is invalid");
  const actual = receipt.actual_identity ?? "unreported";
  const provenance = requireText(input.dispatch_provenance_path);
  const provenanceHash = requireHash(input.dispatch_provenance_sha256);
  const hostHash = receiptHash(receipt, input.host_spawn_receipt_sha256);
  const base = {
    schema: VALIDATOR_DISPATCH_ACK_SCHEMA, event_kind: "VALIDATOR_DISPATCH_ACK", binding_version: 1,
    ...parts, idempotency_key: deriveValidatorAckIdempotencyKey({ ...parts, validator_task_id: task }),
    validator_task_id: task, validator_turn_id_at_dispatch: "unavailable", turn_state: UNAVAILABLE_AT_DISPATCH,
    dispatch_provenance_path: provenance, dispatch_provenance_sha256: provenanceHash,
    host_spawn_receipt_sha256: hostHash, actual_identity: actual, protected_effects: 0,
    retry_count: 0, descendant_count: 0, observed_at_ms: input.observed_at_ms ?? 0,
    observed_elapsed_ms: input.observed_elapsed_ms ?? 0,
  };
  if (!number(base.observed_at_ms) || !number(base.observed_elapsed_ms)) fail("INVALID_VALIDATOR_BINDING", "ACK measurements are invalid");
  return withSelfHash(base, "ack_content_sha256");
}

export function createValidatorDispatchAck(input: ValidatorDispatchAckInput): ValidatorDispatchAck {
  const value = ackBase(input);
  validateAckEvent(value);
  return value;
}
export const buildValidatorDispatchAck = createValidatorDispatchAck;
export const makeValidatorDispatchAck = createValidatorDispatchAck;
export const bindValidatorDispatchAck = createValidatorDispatchAck;

function manifestEntries(value: unknown, schemaOverride?: string): { schema: string; entries: EvidenceManifestEntry[] } {
  const object = record(value) ? value : undefined;
  const raw = Array.isArray(value) ? value : object?.entries;
  if (!Array.isArray(raw) || raw.length === 0) fail("MANIFEST_HASH_OR_ORDER_MISMATCH", "Evidence manifest entries are required");
  const entries = raw.map((entry) => {
    if (!record(entry) || !exactKeys(entry, ["path", "sha256", "bytes", "role"])
      || !text(entry.path) || !hash(entry.sha256) || !number(entry.bytes) || !text(entry.role)) {
      fail("MANIFEST_HASH_OR_ORDER_MISMATCH", "Evidence manifest entry is not closed or typed");
    }
    return { path: entry.path, sha256: entry.sha256, bytes: entry.bytes, role: entry.role };
  });
  const schema = object?.schema ?? schemaOverride;
  if (!text(schema)) fail("MANIFEST_HASH_OR_ORDER_MISMATCH", "Evidence manifest schema is required");
  return { schema, entries };
}

function terminalBase(input: ValidatorTerminalInput): JsonRecord {
  if (record(input) && Object.hasOwn(input, "actual_identity")) fail("CALLER_IDENTITY_SUBSTITUTION", "Identity must come from host terminal evidence");
  validateAckEvent(input.ack);
  if (!same(input.ack, input.ack)) fail("INVALID_VALIDATOR_EVENT", "ACK is not canonical");
  const task = hostTask(input.host_terminal_receipt);
  if (task !== input.ack.validator_task_id) fail("TERMINAL_TASK_ID_MISMATCH", "Terminal task differs from ACK task");
  const parts = bindingParts(input.binding, task);
  if (parts.validation_id !== input.ack.validation_id) fail("TERMINAL_VALIDATION_ID_MISMATCH", "Terminal validation ID differs from ACK");
  if (parts.effect_id !== input.ack.effect_id || parts.set_id !== input.ack.set_id
    || parts.controller_generation !== input.ack.controller_generation) {
    fail("TERMINAL_EFFECT_OR_SET_MISMATCH", "Terminal binding differs from ACK binding");
  }
  const turn = hostTurn(input.host_terminal_receipt);
  const terminalReceipt = input.host_terminal_receipt;
  if ((terminalReceipt.effect_id !== undefined && terminalReceipt.effect_id !== parts.effect_id)
    || (terminalReceipt.idempotency_key !== undefined && terminalReceipt.idempotency_key !== input.binding.effect.idempotency_key)
    || (terminalReceipt.controller_generation !== undefined && terminalReceipt.controller_generation !== parts.controller_generation)) {
    fail("TERMINAL_EFFECT_OR_SET_MISMATCH", "Host terminal receipt does not match the reserved effect");
  }
  const packetSchema = record(input.terminal_packet) && text(input.terminal_packet.schema)
    ? input.terminal_packet.schema : input.terminal_packet_schema;
  const packetRecord = record(input.terminal_packet) ? input.terminal_packet : undefined;
  if (packetRecord && (["bead_id", "set_id", "validation_id", "effect_id", "validator_task_id", "validator_turn_id"] as const)
    .some((key) => packetRecord[key] !== undefined && packetRecord[key] !== ({ bead_id: parts.bead_id, set_id: parts.set_id, validation_id: parts.validation_id, effect_id: parts.effect_id, validator_task_id: task, validator_turn_id: turn } as Record<string, string>)[key])) {
    fail("TERMINAL_PACKET_HASH_MISMATCH", "Terminal packet identifiers do not bind the ACK and host turn");
  }
  const packetHash = canonicalHash(input.terminal_packet, "TERMINAL_PACKET_HASH_MISMATCH");
  if (input.terminal_packet_sha256 !== undefined && input.terminal_packet_sha256 !== packetHash) {
    fail("TERMINAL_PACKET_HASH_MISMATCH", "Terminal packet hash does not bind packet bytes");
  }
  const manifest = manifestEntries(input.evidence_manifest, input.evidence_manifest_schema);
  const manifestHash = canonicalHash(input.evidence_manifest, "MANIFEST_HASH_OR_ORDER_MISMATCH");
  if (input.evidence_manifest_sha256 !== undefined && input.evidence_manifest_sha256 !== manifestHash) {
    fail("MANIFEST_HASH_OR_ORDER_MISMATCH", "Manifest hash does not bind manifest bytes");
  }
  const order = input.evidence_materialization_order ?? MANIFEST_BEFORE_TERMINAL;
  if (order === TERMINAL_BEFORE_MANIFEST_BEFORE_RECORD_RESULT && input.evidence_manifest_sha256 === undefined) {
    fail("LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED", "Legacy order requires a measured manifest hash");
  }
  if (order !== MANIFEST_BEFORE_TERMINAL && order !== TERMINAL_BEFORE_MANIFEST_BEFORE_RECORD_RESULT) {
    fail("MANIFEST_HASH_OR_ORDER_MISMATCH", "Evidence materialization order is not canonical");
  }
  const terminalReceiptHash = receiptHash(input.host_terminal_receipt, input.host_terminal_receipt_sha256);
  const actual = input.host_terminal_receipt.actual_identity ?? "unreported";
  const terminalPacketSchema = requireText(packetSchema);
  const evidenceSchema = input.evidence_manifest_schema ?? manifest.schema;
  const base = {
    schema: VALIDATOR_TERMINAL_SCHEMA, event_kind: "VALIDATOR_TERMINAL", binding_version: 1,
    bead_id: parts.bead_id, set_id: parts.set_id, validation_id: parts.validation_id,
    effect_id: parts.effect_id, controller_generation: parts.controller_generation,
    expected_revision: parts.expected_revision, dispatch_ack_content_sha256: input.ack.ack_content_sha256,
    validator_task_id: task, validator_turn_id: turn, turn_state: BOUND_AT_TERMINAL,
    host_terminal_receipt_path: requireText(input.host_terminal_receipt_path), host_terminal_receipt_sha256: terminalReceiptHash,
    terminal_packet_path: requireText(input.terminal_packet_path), terminal_packet_sha256: input.terminal_packet_sha256 ?? packetHash,
    terminal_packet_schema: terminalPacketSchema, evidence_manifest_path: requireText(input.evidence_manifest_path),
    evidence_manifest_sha256: input.evidence_manifest_sha256 ?? manifestHash, evidence_manifest_schema: requireText(evidenceSchema),
    evidence_materialization_order: order, evidence_digest: canonicalHash(manifest.entries), verdict: requireText(input.verdict),
    requested_model: parts.requested_model, requested_reasoning: parts.requested_reasoning, actual_identity: actual,
    protected_effects: 0, retry_count: 0, descendant_count: 0, observed_at_ms: input.observed_at_ms ?? 0,
    observed_elapsed_ms: input.observed_elapsed_ms ?? 0,
  };
  if (!number(base.observed_at_ms) || !number(base.observed_elapsed_ms)) fail("INVALID_VALIDATOR_BINDING", "Terminal measurements are invalid");
  return {
    ...base,
    idempotency_key: deriveValidatorTerminalIdempotencyKey({ ...base, terminal_packet_sha256: base.terminal_packet_sha256 }),
  };
}

export function createValidatorTerminal(input: ValidatorTerminalInput): ValidatorTerminal {
  const value = withSelfHash(terminalBase(input), "terminal_content_sha256");
  validateTerminalEvent(value);
  return value;
}
export const buildValidatorTerminal = createValidatorTerminal;
export const makeValidatorTerminal = createValidatorTerminal;
export const bindValidatorTerminal = createValidatorTerminal;
export function bindLegacyForwardValidatorTerminal(input: ValidatorTerminalInput): ValidatorTerminal {
  return createValidatorTerminal({ ...input, evidence_manifest_sha256: canonicalHash(input.evidence_manifest), evidence_materialization_order: TERMINAL_BEFORE_MANIFEST_BEFORE_RECORD_RESULT });
}

/* Strict parsing rejects duplicate keys, non-UTF-8 bytes, non-canonical numbers, and missing final LF. */
function duplicateKeyScan(textValue: string): void {
  let index = 0;
  const whitespace = () => { while (/\s/u.test(textValue[index] ?? "")) index += 1; };
  const stringEnd = () => {
    const start = index;
    if (textValue[index++] !== '"') throw new Error("string");
    while (index < textValue.length) {
      const char = textValue[index++];
      if (char === "\\") index += 1;
      else if (char === '"') return JSON.parse(textValue.slice(start, index)) as string;
    }
    throw new Error("unterminated string");
  };
  const valueScan = (): void => {
    whitespace();
    const char = textValue[index];
    if (char === '"') { stringEnd(); return; }
    if (char === "{") {
      index += 1; whitespace(); const keys = new Set<string>();
      if (textValue[index] === "}") { index += 1; return; }
      for (;;) {
        whitespace(); const key = stringEnd(); if (keys.has(key)) throw new Error("duplicate key"); keys.add(key);
        whitespace(); if (textValue[index++] !== ":") throw new Error("colon"); valueScan(); whitespace();
        if (textValue[index] === "}") { index += 1; return; }
        if (textValue[index++] !== ",") throw new Error("comma");
      }
    }
    if (char === "[") {
      index += 1; whitespace(); if (textValue[index] === "]") { index += 1; return; }
      for (;;) { valueScan(); whitespace(); if (textValue[index] === "]") { index += 1; return; } if (textValue[index++] !== ",") throw new Error("comma"); }
    }
    const match = textValue.slice(index).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u);
    if (!match) throw new Error("value"); index += match[0].length;
  };
  valueScan(); whitespace(); if (index !== textValue.length) throw new Error("trailing bytes");
}

export function parseCanonicalValidatorJson(input: string | Uint8Array): unknown {
  let source: string;
  try { source = typeof input === "string" ? input : new TextDecoder("utf-8", { fatal: true }).decode(input); }
  catch { fail("INVALID_VALIDATOR_EVENT", "Input is not valid UTF-8"); }
  if (!source.endsWith("\n") || source.endsWith("\n\n")) fail("INVALID_VALIDATOR_EVENT", "Canonical JSON requires one final LF");
  const body = source.slice(0, -1);
  try {
    duplicateKeyScan(body);
    const value = JSON.parse(body) as unknown;
    if (canonicalJson(value) !== source) fail("INVALID_VALIDATOR_EVENT", "JSON is not canonical");
    return value;
  } catch (error) {
    if (error instanceof ValidatorBindingError) throw error;
    fail("INVALID_VALIDATOR_EVENT", "JSON is not canonical", { cause: String(error) });
  }
}
export function parseValidatorDispatchAck(input: string | Uint8Array): ValidatorDispatchAck {
  const value = parseCanonicalValidatorJson(input); validateAckEvent(value); return value;
}
export function parseValidatorTerminal(input: string | Uint8Array): ValidatorTerminal {
  const value = parseCanonicalValidatorJson(input); validateTerminalEvent(value); return value;
}
export const serializeValidatorDispatchAck = (value: ValidatorDispatchAck): string => { validateAckEvent(value); return canonicalJson(value); };
export const serializeValidatorTerminal = (value: ValidatorTerminal): string => { validateTerminalEvent(value); return canonicalJson(value); };

export type ValidatorBindingStage = "DISPATCH_ACKED" | "TERMINAL_BOUND" | "RESULT_RECORDED";
export interface ValidatorBindingSidecar {
  readonly stage: ValidatorBindingStage;
  readonly validation_id: string;
  readonly effect_id: string;
  readonly controller_generation: string;
  readonly validator_task_id: string;
  readonly dispatch_ack_content_sha256: Hash;
  readonly validator_turn_id: string;
  readonly terminal_content_sha256: Hash | null;
  readonly terminal_packet_sha256: Hash | null;
  readonly evidence_manifest_sha256: Hash | null;
  readonly result_verdict?: string;
}
export interface ValidatorBindingState {
  readonly schema: "corvus.validator_binding_sidecar.v1";
  readonly bindings: Readonly<Record<string, ValidatorBindingSidecar>>;
}
export interface ValidatorBindingApplyResult { readonly state: ValidatorBindingState; readonly replayed: boolean; }

export function initialValidatorBindingState(): ValidatorBindingState {
  return { schema: "corvus.validator_binding_sidecar.v1", bindings: {} };
}
export const createValidatorBindingState = initialValidatorBindingState;
function sidecarState(value: ValidatorBindingState): void {
  if (!record(value) || value.schema !== "corvus.validator_binding_sidecar.v1" || !record(value.bindings)) {
    fail("INVALID_VALIDATOR_BINDING", "Validator binding sidecar is malformed");
  }
}
export function applyValidatorDispatchAck(state: ValidatorBindingState, ack: ValidatorDispatchAck): ValidatorBindingApplyResult {
  sidecarState(state); validateAckEvent(ack);
  const existing = state.bindings[ack.effect_id];
  if (existing !== undefined) {
    if (existing.controller_generation !== ack.controller_generation) fail("STALE_CONTROLLER_GENERATION", "ACK generation is stale");
    if (existing.dispatch_ack_content_sha256 === ack.ack_content_sha256
      && existing.validator_task_id === ack.validator_task_id) return { state, replayed: true };
    fail("ACK_IDEMPOTENCY_CONFLICT", "A second ACK changed the durable binding");
  }
  const binding: ValidatorBindingSidecar = {
    stage: "DISPATCH_ACKED", validation_id: ack.validation_id, effect_id: ack.effect_id,
    controller_generation: ack.controller_generation, validator_task_id: ack.validator_task_id,
    dispatch_ack_content_sha256: ack.ack_content_sha256, validator_turn_id: "unavailable",
    terminal_content_sha256: null, terminal_packet_sha256: null, evidence_manifest_sha256: null,
  };
  return { state: { ...state, bindings: { ...state.bindings, [ack.effect_id]: binding } }, replayed: false };
}
export const recordValidatorDispatchAck = applyValidatorDispatchAck;

export function applyValidatorTerminal(state: ValidatorBindingState, terminal: ValidatorTerminal): ValidatorBindingApplyResult {
  sidecarState(state); validateTerminalEvent(terminal);
  const existing = state.bindings[terminal.effect_id];
  if (existing === undefined) fail("TERMINAL_BEFORE_ACK", "Terminal requires one prior dispatch ACK");
  if (existing.controller_generation !== terminal.controller_generation) fail("STALE_CONTROLLER_GENERATION", "Terminal generation is stale");
  if (existing.validation_id !== terminal.validation_id) fail("TERMINAL_VALIDATION_ID_MISMATCH", "Terminal validation ID differs from ACK");
  if (existing.validator_task_id !== terminal.validator_task_id) fail("TERMINAL_TASK_ID_MISMATCH", "Terminal task differs from ACK");
  if (existing.dispatch_ack_content_sha256 !== terminal.dispatch_ack_content_sha256) fail("TERMINAL_IDEMPOTENCY_CONFLICT", "Terminal does not bind ACK bytes");
  if (existing.stage !== "DISPATCH_ACKED") {
    if (existing.terminal_content_sha256 === terminal.terminal_content_sha256
      && existing.terminal_packet_sha256 === terminal.terminal_packet_sha256
      && existing.evidence_manifest_sha256 === terminal.evidence_manifest_sha256) return { state, replayed: true };
    if (existing.stage === "TERMINAL_BOUND" && existing.evidence_manifest_sha256 !== terminal.evidence_manifest_sha256) {
      fail("POST_TERMINAL_UNDECLARED_EVIDENCE", "Evidence was introduced after the terminal event");
    }
    fail("VALIDATOR_TERMINAL_CONFLICT", "A second terminal changed the validator binding");
  }
  const binding: ValidatorBindingSidecar = {
    ...existing, stage: "TERMINAL_BOUND", validator_turn_id: terminal.validator_turn_id,
    terminal_content_sha256: terminal.terminal_content_sha256,
    terminal_packet_sha256: terminal.terminal_packet_sha256, evidence_manifest_sha256: terminal.evidence_manifest_sha256,
  };
  return { state: { ...state, bindings: { ...state.bindings, [terminal.effect_id]: binding } }, replayed: false };
}
export const recordValidatorTerminal = applyValidatorTerminal;

export function applyValidatorResult(state: ValidatorBindingState, terminal: ValidatorTerminal, verdict = terminal.verdict): ValidatorBindingApplyResult {
  sidecarState(state); validateTerminalEvent(terminal);
  const existing = state.bindings[terminal.effect_id];
  if (existing === undefined || existing.stage === "DISPATCH_ACKED") fail("TERMINAL_BEFORE_ACK", "Result requires a bound terminal");
  if (existing.stage === "RESULT_RECORDED") {
    if (existing.terminal_content_sha256 === terminal.terminal_content_sha256 && existing.result_verdict === verdict) return { state, replayed: true };
    fail("RESULT_DUPLICATE_CONFLICT", "A second result changed the durable validation");
  }
  if (existing.terminal_content_sha256 !== terminal.terminal_content_sha256) fail("DUPLICATE_RECORD_RESULT", "Result does not bind the recorded terminal");
  const binding: ValidatorBindingSidecar = { ...existing, stage: "RESULT_RECORDED", result_verdict: verdict };
  return { state: { ...state, bindings: { ...state.bindings, [terminal.effect_id]: binding } }, replayed: false };
}
export const recordValidatorResult = applyValidatorResult;
export const validatorBindingForEffect = (state: ValidatorBindingState, effectId: string): ValidatorBindingSidecar | undefined => {
  sidecarState(state); return state.bindings[effectId];
};
