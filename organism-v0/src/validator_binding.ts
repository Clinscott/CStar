import { canonicalSha256, hashOmittingField, isPlainJsonObject, withSelfHash } from "./canonical.js";

export const VALIDATOR_ACK_SCHEMA = "corvus.organism.validator_ack.v1" as const;
export const VALIDATOR_TERMINAL_SCHEMA = "corvus.organism.validator_terminal.v1" as const;
export const VALIDATOR_RESULT_SCHEMA = "corvus.organism.validator_result.v1" as const;
export const VALIDATOR_BINDING_STATE_SCHEMA = "corvus.organism.validator_binding_state.v1" as const;
export const DISPATCH_ACK = "ACK" as const;
export const TERMINAL_STATUS = "TERMINAL" as const;

export type ValidatorVerdict = "ACCEPTED" | "REJECTED" | "UNKNOWN";
export type WorkerTurn = string;

export interface PacketHashes {
  readonly packet_file_sha256: string;
  readonly packet_content_sha256: string;
}

export interface ValidatorAck extends PacketHashes {
  readonly schema: typeof VALIDATOR_ACK_SCHEMA;
  readonly status: typeof DISPATCH_ACK;
  readonly validation_id: string;
  readonly set_id: string;
  readonly effect_id: string;
  readonly controller_generation: string;
  readonly worker_task: string;
  readonly worker_turn: "unavailable";
  readonly idempotency_key: string;
  readonly ack_sha256: string;
}

export interface ValidatorTerminal extends PacketHashes {
  readonly schema: typeof VALIDATOR_TERMINAL_SCHEMA;
  readonly status: typeof TERMINAL_STATUS;
  readonly validation_id: string;
  readonly set_id: string;
  readonly effect_id: string;
  readonly controller_generation: string;
  readonly worker_task: string;
  readonly worker_turn: string;
  readonly verdict: ValidatorVerdict;
  readonly manifest: readonly unknown[] | null;
  readonly manifest_sha256: string;
  readonly evidence: unknown;
  readonly evidence_sha256: string;
  readonly manifest_preexisted: boolean;
  readonly idempotency_key: string;
  readonly terminal_sha256: string;
}

export interface ValidatorResult {
  readonly schema: typeof VALIDATOR_RESULT_SCHEMA;
  readonly validation_id: string;
  readonly set_id: string;
  readonly effect_id: string;
  readonly controller_generation: string;
  readonly terminal_sha256: string;
  readonly verdict: ValidatorVerdict;
  readonly result_sha256: string;
}

export interface ValidatorBindingState {
  readonly schema: typeof VALIDATOR_BINDING_STATE_SCHEMA;
  readonly controller_generation: string;
  readonly revision: number;
  readonly acks: readonly ValidatorAck[];
  readonly terminals: readonly ValidatorTerminal[];
  readonly results: readonly ValidatorResult[];
  readonly expected_manifest_sha256: string | null;
}

export interface ValidatorBindingInput extends Partial<PacketHashes> {
  readonly validation_id: string;
  readonly set_id: string;
  readonly effect_id: string;
  readonly controller_generation: string;
  readonly worker_task: string;
  readonly worker_turn?: string | null;
  readonly packet_hashes?: Partial<PacketHashes>;
  readonly packet_sha256?: string;
  readonly packet_content_hash?: string;
  readonly host_task_id?: string | null;
  readonly caller_identity?: string;
  readonly actual_identity?: string;
  readonly expected_controller_generation?: string;
  readonly idempotency_key?: string;
  readonly ack_idempotency_key?: string;
  readonly terminal_idempotency_key?: string;
}

export interface ValidatorAckInput extends ValidatorBindingInput {
  readonly legacy_forward_bind?: boolean;
}

export interface ValidatorTerminalInput extends ValidatorBindingInput {
  readonly verdict: ValidatorVerdict;
  readonly manifest?: readonly unknown[] | null;
  readonly manifest_sha256?: string;
  readonly manifest_hash?: string;
  readonly evidence?: unknown;
  readonly evidence_sha256?: string;
  readonly evidence_hash?: string;
  readonly manifest_preexisted?: boolean;
  readonly legacy_forward_bind?: boolean;
}

export interface ValidatorStateInput {
  readonly controller_generation: string;
  readonly expected_manifest?: readonly unknown[] | null;
}

export interface AckRecordResult {
  readonly state: ValidatorBindingState;
  readonly ack: ValidatorAck;
  readonly replayed: boolean;
}

export interface TerminalRecordResult {
  readonly state: ValidatorBindingState;
  readonly terminal: ValidatorTerminal;
  readonly replayed: boolean;
}

export interface ResultRecordResult {
  readonly state: ValidatorBindingState;
  readonly result: ValidatorResult;
}

export type ValidatorBindingErrorCode =
  | "INVALID_ACK"
  | "INVALID_TERMINAL"
  | "INVALID_RESULT"
  | "INVALID_STATE"
  | "ACK_TASK_ID_NOT_HOST_BOUND"
  | "ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH"
  | "ACK_WITH_VERDICT_OR_EVIDENCE"
  | "TERMINAL_BEFORE_ACK"
  | "TERMINAL_TASK_ID_MISMATCH"
  | "TERMINAL_TURN_NULL_OR_UNAVAILABLE"
  | "TERMINAL_VALIDATION_ID_MISMATCH"
  | "TERMINAL_EFFECT_OR_SET_MISMATCH"
  | "STALE_CONTROLLER_GENERATION"
  | "TERMINAL_PACKET_HASH_MISMATCH"
  | "MANIFEST_HASH_OR_ORDER_MISMATCH"
  | "POST_TERMINAL_UNDECLARED_EVIDENCE"
  | "CALLER_IDENTITY_SUBSTITUTION"
  | "ACK_IDEMPOTENCY_CONFLICT"
  | "TERMINAL_IDEMPOTENCY_CONFLICT"
  | "DUPLICATE_RECORD_RESULT"
  | "LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED";

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

const SHA256 = /^[0-9a-f]{64}$/u;

function record(value: unknown): value is Record<string, unknown> {
  return isPlainJsonObject(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hash(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

function canonical(value: unknown, code: ValidatorBindingErrorCode, label: string): string {
  try {
    return canonicalSha256(value);
  } catch (error) {
    throw new ValidatorBindingError(code, `${label} is not canonical JSON`, { cause: String(error) });
  }
}

function field(input: Record<string, unknown>, names: readonly string[]): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(input, name)) return input[name];
  }
  return undefined;
}

function packetHashes(input: ValidatorBindingInput, code: ValidatorBindingErrorCode): PacketHashes {
  const nested = record(input.packet_hashes) ? input.packet_hashes : {};
  const file = field(input as Record<string, unknown>, ["packet_file_sha256", "packet_sha256"])
    ?? field(nested, ["packet_file_sha256", "file_sha256"]);
  const content = field(input as Record<string, unknown>, ["packet_content_sha256", "packet_content_hash"])
    ?? field(nested, ["packet_content_sha256", "content_sha256"]);
  if (!hash(file) || !hash(content)) {
    throw new ValidatorBindingError(code, "Both immutable packet hashes are required");
  }
  return { packet_file_sha256: file, packet_content_sha256: content };
}

function commonBinding(input: ValidatorBindingInput, code: ValidatorBindingErrorCode): Omit<ValidatorAck, "schema" | "status" | "worker_turn" | "idempotency_key" | "ack_sha256"> {
  if (!record(input)
    || !text(input.validation_id)
    || !text(input.set_id)
    || !text(input.effect_id)
    || !text(input.controller_generation)
    || !text(input.worker_task)) {
    throw new ValidatorBindingError(code, "Validator binding identifiers are required");
  }
  if (input.host_task_id !== undefined && input.host_task_id !== input.worker_task) {
    throw new ValidatorBindingError("ACK_TASK_ID_NOT_HOST_BOUND", "Worker task is not the host-bound task");
  }
  const caller = input.caller_identity ?? input.actual_identity;
  if (caller !== undefined && caller !== "unreported" && caller !== input.worker_task) {
    throw new ValidatorBindingError("CALLER_IDENTITY_SUBSTITUTION", "Caller identity cannot replace the bound worker task");
  }
  if (input.expected_controller_generation !== undefined
    && input.expected_controller_generation !== input.controller_generation) {
    throw new ValidatorBindingError("STALE_CONTROLLER_GENERATION", "Controller generation is stale");
  }
  return {
    validation_id: input.validation_id,
    set_id: input.set_id,
    effect_id: input.effect_id,
    controller_generation: input.controller_generation,
    worker_task: input.worker_task,
    ...packetHashes(input, code),
  };
}

function ackWithoutHash(input: ValidatorAckInput): Omit<ValidatorAck, "ack_sha256"> {
  if (Object.prototype.hasOwnProperty.call(input, "verdict")
    || Object.prototype.hasOwnProperty.call(input, "evidence")
    || Object.prototype.hasOwnProperty.call(input, "evidence_sha256")
    || Object.prototype.hasOwnProperty.call(input, "evidence_hash")) {
    throw new ValidatorBindingError("ACK_WITH_VERDICT_OR_EVIDENCE", "Dispatch ACK cannot contain terminal verdict or evidence");
  }
  if (input.worker_turn !== undefined && input.worker_turn !== "unavailable") {
    throw new ValidatorBindingError("ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH", "Dispatch ACK worker_turn must be unavailable");
  }
  const binding = commonBinding(input, "INVALID_ACK");
  const idempotency_key = input.ack_idempotency_key ?? input.idempotency_key
    ?? `ack:${canonical(binding, "INVALID_ACK", "ACK binding")}`;
  if (!text(idempotency_key)) throw new ValidatorBindingError("INVALID_ACK", "ACK idempotency key is required");
  return { schema: VALIDATOR_ACK_SCHEMA, status: DISPATCH_ACK, ...binding, worker_turn: "unavailable", idempotency_key };
}

export function createValidatorAck(input: ValidatorAckInput): ValidatorAck {
  const base = ackWithoutHash(input);
  return withSelfHash(base, "ack_sha256") as ValidatorAck;
}

export const makeValidatorAck = createValidatorAck;
export const createAck = createValidatorAck;
export const makeAck = createValidatorAck;

function manifestHash(manifest: readonly unknown[] | null | undefined, supplied: string | undefined): { value: readonly unknown[] | null; hash: string } {
  const value = manifest === undefined ? null : manifest;
  if (supplied !== undefined && !hash(supplied)) {
    throw new ValidatorBindingError("MANIFEST_HASH_OR_ORDER_MISMATCH", "Manifest hash is not a SHA-256 value");
  }
  const computed = canonical(value, "MANIFEST_HASH_OR_ORDER_MISMATCH", "Manifest");
  if (supplied !== undefined && supplied !== computed) {
    throw new ValidatorBindingError("MANIFEST_HASH_OR_ORDER_MISMATCH", "Manifest hash does not bind manifest order");
  }
  return { value, hash: supplied ?? computed };
}

function evidenceHash(evidence: unknown, supplied: string | undefined): { value: unknown; hash: string } {
  if (evidence === undefined && supplied === undefined) {
    throw new ValidatorBindingError("INVALID_TERMINAL", "Immutable evidence hash is required");
  }
  if (supplied !== undefined && !hash(supplied)) {
    throw new ValidatorBindingError("INVALID_TERMINAL", "Evidence hash is not a SHA-256 value");
  }
  const value = evidence;
  const computed = value === undefined ? null : canonical(value, "INVALID_TERMINAL", "Evidence");
  if (supplied === undefined || computed === null) {
    if (supplied === undefined) throw new ValidatorBindingError("INVALID_TERMINAL", "Evidence hash is required");
    return { value, hash: supplied };
  }
  if (supplied !== computed) throw new ValidatorBindingError("INVALID_TERMINAL", "Evidence hash does not bind evidence");
  return { value, hash: supplied };
}

function terminalWithoutHash(input: ValidatorTerminalInput): Omit<ValidatorTerminal, "terminal_sha256"> {
  if (!text(input.verdict) || !["ACCEPTED", "REJECTED", "UNKNOWN"].includes(input.verdict)) {
    throw new ValidatorBindingError("INVALID_TERMINAL", "Terminal verdict is invalid");
  }
  if (!text(input.worker_turn) || input.worker_turn === "unavailable") {
    throw new ValidatorBindingError("TERMINAL_TURN_NULL_OR_UNAVAILABLE", "Terminal worker_turn must be concrete");
  }
  const binding = commonBinding(input, "INVALID_TERMINAL");
  const manifest = manifestHash(input.manifest, input.manifest_sha256 ?? input.manifest_hash);
  const evidence = evidenceHash(input.evidence, input.evidence_sha256 ?? input.evidence_hash);
  const legacy = input.legacy_forward_bind === true;
  const preexisted = input.manifest_preexisted ?? false;
  if (legacy && preexisted && input.manifest === undefined) {
    throw new ValidatorBindingError(
      "LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED",
      "A legacy forward bind cannot claim an undeclared manifest pre-existed",
    );
  }
  const idempotency_key = input.terminal_idempotency_key ?? input.idempotency_key
    ?? `terminal:${canonical({ ...binding, worker_turn: input.worker_turn, verdict: input.verdict, manifest_sha256: manifest.hash, evidence_sha256: evidence.hash }, "INVALID_TERMINAL", "Terminal binding")}`;
  if (!text(idempotency_key)) throw new ValidatorBindingError("INVALID_TERMINAL", "Terminal idempotency key is required");
  return {
    schema: VALIDATOR_TERMINAL_SCHEMA,
    status: TERMINAL_STATUS,
    ...binding,
    worker_turn: input.worker_turn,
    verdict: input.verdict,
    manifest: manifest.value,
    manifest_sha256: manifest.hash,
    evidence: evidence.value,
    evidence_sha256: evidence.hash,
    manifest_preexisted: preexisted,
    idempotency_key,
  };
}

export function createValidatorTerminal(input: ValidatorTerminalInput): ValidatorTerminal {
  const base = terminalWithoutHash(input);
  return withSelfHash(base, "terminal_sha256") as ValidatorTerminal;
}

export const makeValidatorTerminal = createValidatorTerminal;
export const createTerminal = createValidatorTerminal;
export const makeTerminal = createValidatorTerminal;

export function createValidatorState(input: ValidatorStateInput): ValidatorBindingState {
  if (!text(input.controller_generation)) throw new ValidatorBindingError("INVALID_STATE", "Controller generation is required");
  const expected = input.expected_manifest === undefined ? null
    : canonical(input.expected_manifest, "INVALID_STATE", "Expected manifest");
  return {
    schema: VALIDATOR_BINDING_STATE_SCHEMA,
    controller_generation: input.controller_generation,
    revision: 0,
    acks: [],
    terminals: [],
    results: [],
    expected_manifest_sha256: expected,
  };
}

export const initialValidatorState = createValidatorState;
export const createBindingState = createValidatorState;
export const initialBindingState = createValidatorState;

function assertAck(value: unknown): asserts value is ValidatorAck {
  if (!record(value) || value.schema !== VALIDATOR_ACK_SCHEMA || value.status !== DISPATCH_ACK
    || !text(value.validation_id) || !text(value.set_id) || !text(value.effect_id)
    || !text(value.controller_generation) || !text(value.worker_task) || value.worker_turn !== "unavailable"
    || !hash(value.packet_file_sha256) || !hash(value.packet_content_sha256) || !text(value.idempotency_key)
    || !hash(value.ack_sha256) || Object.prototype.hasOwnProperty.call(value, "verdict")
    || Object.prototype.hasOwnProperty.call(value, "evidence")) {
    throw new ValidatorBindingError("INVALID_ACK", "Validator ACK is malformed");
  }
  try {
    if (hashOmittingField(value, "ack_sha256") !== value.ack_sha256) throw new Error("ACK self-hash mismatch");
  } catch (error) {
    throw new ValidatorBindingError("INVALID_ACK", String(error));
  }
}

function assertTerminal(value: unknown): asserts value is ValidatorTerminal {
  if (!record(value) || value.schema !== VALIDATOR_TERMINAL_SCHEMA || value.status !== TERMINAL_STATUS
    || !text(value.validation_id) || !text(value.set_id) || !text(value.effect_id)
    || !text(value.controller_generation) || !text(value.worker_task) || !text(value.worker_turn)
    || value.worker_turn === "unavailable" || !["ACCEPTED", "REJECTED", "UNKNOWN"].includes(String(value.verdict))
    || (value.manifest !== null && !Array.isArray(value.manifest)) || !hash(value.manifest_sha256)
    || !hash(value.evidence_sha256) || typeof value.manifest_preexisted !== "boolean"
    || !text(value.idempotency_key) || !hash(value.terminal_sha256)
    || !hash(value.packet_file_sha256) || !hash(value.packet_content_sha256)) {
    throw new ValidatorBindingError("INVALID_TERMINAL", "Validator terminal is malformed");
  }
  try {
    if (value.manifest !== null && canonical(value.manifest, "INVALID_TERMINAL", "Manifest") !== value.manifest_sha256) {
      throw new ValidatorBindingError("MANIFEST_HASH_OR_ORDER_MISMATCH", "Manifest hash does not bind manifest order");
    }
    if (value.evidence !== undefined && canonical(value.evidence, "INVALID_TERMINAL", "Evidence") !== value.evidence_sha256) {
      throw new ValidatorBindingError("INVALID_TERMINAL", "Evidence hash does not bind evidence");
    }
    if (hashOmittingField(value, "terminal_sha256") !== value.terminal_sha256) throw new Error("Terminal self-hash mismatch");
  } catch (error) {
    if (error instanceof ValidatorBindingError) throw error;
    throw new ValidatorBindingError("INVALID_TERMINAL", String(error));
  }
}

function assertState(value: unknown): asserts value is ValidatorBindingState {
  if (!record(value) || value.schema !== VALIDATOR_BINDING_STATE_SCHEMA || !text(value.controller_generation)
    || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.acks)
    || !Array.isArray(value.terminals) || !Array.isArray(value.results)
    || (value.expected_manifest_sha256 !== null && !hash(value.expected_manifest_sha256))) {
    throw new ValidatorBindingError("INVALID_STATE", "Validator binding state is malformed");
  }
  for (const ack of value.acks) assertAck(ack);
  for (const terminal of value.terminals) assertTerminal(terminal);
}

function sameAck(left: ValidatorAck, right: ValidatorAck): boolean {
  return canonicalSha256(left) === canonicalSha256(right);
}

function sameTerminal(left: ValidatorTerminal, right: ValidatorTerminal): boolean {
  return canonicalSha256(left) === canonicalSha256(right);
}

export function recordValidatorAck(state: ValidatorBindingState, ack: ValidatorAck): AckRecordResult {
  assertState(state);
  assertAck(ack);
  if (ack.controller_generation !== state.controller_generation) {
    throw new ValidatorBindingError("STALE_CONTROLLER_GENERATION", "ACK controller generation is stale");
  }
  const byValidation = state.acks.find((entry) => entry.validation_id === ack.validation_id);
  const byKey = state.acks.find((entry) => entry.idempotency_key === ack.idempotency_key);
  if (byValidation !== undefined || byKey !== undefined) {
    const existing = byValidation ?? byKey;
    if (existing !== undefined && sameAck(existing, ack)) return { state, ack: existing, replayed: true };
    throw new ValidatorBindingError("ACK_IDEMPOTENCY_CONFLICT", "ACK idempotency identity conflicts");
  }
  const next: ValidatorBindingState = { ...state, revision: state.revision + 1, acks: [...state.acks, ack] };
  return { state: next, ack, replayed: false };
}

export const acceptValidatorAck = recordValidatorAck;
export const recordAck = recordValidatorAck;
export const acceptAck = recordValidatorAck;

export function recordValidatorTerminal(state: ValidatorBindingState, terminal: ValidatorTerminal): TerminalRecordResult {
  assertState(state);
  assertTerminal(terminal);
  if (terminal.controller_generation !== state.controller_generation) {
    throw new ValidatorBindingError("STALE_CONTROLLER_GENERATION", "Terminal controller generation is stale");
  }
  const ack = state.acks.find((entry) => entry.validation_id === terminal.validation_id);
  if (ack === undefined) throw new ValidatorBindingError("TERMINAL_BEFORE_ACK", "Terminal requires a prior ACK");
  if (terminal.validation_id !== ack.validation_id) {
    throw new ValidatorBindingError("TERMINAL_VALIDATION_ID_MISMATCH", "Terminal validation_id does not match ACK");
  }
  if (terminal.worker_task !== ack.worker_task) {
    throw new ValidatorBindingError("TERMINAL_TASK_ID_MISMATCH", "Terminal worker_task does not match ACK");
  }
  if (terminal.effect_id !== ack.effect_id || terminal.set_id !== ack.set_id) {
    throw new ValidatorBindingError("TERMINAL_EFFECT_OR_SET_MISMATCH", "Terminal effect or SET does not match ACK");
  }
  if (terminal.packet_file_sha256 !== ack.packet_file_sha256 || terminal.packet_content_sha256 !== ack.packet_content_sha256) {
    throw new ValidatorBindingError("TERMINAL_PACKET_HASH_MISMATCH", "Terminal packet hashes do not match ACK");
  }
  if (state.expected_manifest_sha256 !== null && terminal.manifest_sha256 !== state.expected_manifest_sha256) {
    throw new ValidatorBindingError("MANIFEST_HASH_OR_ORDER_MISMATCH", "Terminal manifest does not match expected order");
  }
  const byValidation = state.terminals.find((entry) => entry.validation_id === terminal.validation_id);
  const byKey = state.terminals.find((entry) => entry.idempotency_key === terminal.idempotency_key);
  if (byValidation !== undefined || byKey !== undefined) {
    const existing = byValidation ?? byKey;
    if (existing !== undefined && sameTerminal(existing, terminal)) return { state, terminal: existing, replayed: true };
    throw new ValidatorBindingError("TERMINAL_IDEMPOTENCY_CONFLICT", "Terminal idempotency identity conflicts");
  }
  const next: ValidatorBindingState = { ...state, revision: state.revision + 1, terminals: [...state.terminals, terminal] };
  return { state: next, terminal, replayed: false };
}

export const acceptValidatorTerminal = recordValidatorTerminal;
export const recordTerminal = recordValidatorTerminal;
export const acceptTerminal = recordValidatorTerminal;

export function recordValidatorResult(state: ValidatorBindingState, terminal: ValidatorTerminal, evidence?: unknown): ResultRecordResult {
  assertState(state);
  assertTerminal(terminal);
  const recorded = state.terminals.find((entry) => entry.validation_id === terminal.validation_id);
  if (recorded === undefined) throw new ValidatorBindingError("TERMINAL_BEFORE_ACK", "Terminal must be recorded before result");
  if (!sameTerminal(recorded, terminal)) throw new ValidatorBindingError("TERMINAL_IDEMPOTENCY_CONFLICT", "Result terminal conflicts with recorded terminal");
  if (state.results.some((entry) => entry.validation_id === terminal.validation_id)) {
    throw new ValidatorBindingError("DUPLICATE_RECORD_RESULT", "Authoritative result was already recorded");
  }
  if (evidence !== undefined) {
    if (terminal.evidence === undefined) throw new ValidatorBindingError("POST_TERMINAL_UNDECLARED_EVIDENCE", "Evidence was not declared by terminal");
    if (canonicalSha256(evidence) !== terminal.evidence_sha256) {
      throw new ValidatorBindingError("POST_TERMINAL_UNDECLARED_EVIDENCE", "Post-terminal evidence is not the declared evidence");
    }
  }
  const resultBase = {
    schema: VALIDATOR_RESULT_SCHEMA,
    validation_id: terminal.validation_id,
    set_id: terminal.set_id,
    effect_id: terminal.effect_id,
    controller_generation: terminal.controller_generation,
    terminal_sha256: terminal.terminal_sha256,
    verdict: terminal.verdict,
    result_sha256: canonicalSha256({ terminal_sha256: terminal.terminal_sha256, evidence_sha256: terminal.evidence_sha256 }),
  } as const;
  const result: ValidatorResult = resultBase;
  return { state: { ...state, revision: state.revision + 1, results: [...state.results, result] }, result };
}

export const consumeAcceptedTerminal = recordValidatorResult;
export const consumeTerminal = recordValidatorResult;
export const recordResult = recordValidatorResult;

export function verifyValidatorAck(value: unknown): value is ValidatorAck {
  try { assertAck(value); return true; } catch { return false; }
}

export function verifyValidatorTerminal(value: unknown): value is ValidatorTerminal {
  try { assertTerminal(value); return true; } catch { return false; }
}

export function verifyValidatorBindingState(value: unknown): value is ValidatorBindingState {
  try { assertState(value); return true; } catch { return false; }
}

export const validateValidatorAck = verifyValidatorAck;
export const validateValidatorTerminal = verifyValidatorTerminal;
export const validateValidatorBindingState = verifyValidatorBindingState;
