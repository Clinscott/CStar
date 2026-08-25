import { canonicalSha256, hashOmittingField, isPlainJsonObject, withSelfHash } from "./canonical.js";
export const DISPATCH_TURN_UNAVAILABLE = "unavailable" as const;
export const ACK_SCHEMA = "corvus.validator_dispatch_ack.v1" as const;
export const TERMINAL_SCHEMA = "corvus.validator_terminal.v1" as const;

export type BindingErrorCode =
  | "INVALID_BINDING_INPUT"
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
  | "VALIDATOR_TERMINAL_CONFLICT"
  | "RESULT_DUPLICATE_CONFLICT"
  | "RESULT_BEFORE_TERMINAL"
  | "LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED";

export class BindingError extends Error {
  readonly code: BindingErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: BindingErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "BindingError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export interface BindingIdentities {
  readonly validationId: string;
  readonly effectId: string;
  readonly setId: string;
  readonly packetFileSha256: string;
  readonly packetContentSha256: string;
  readonly taskId: string;
  readonly controllerGeneration: number;
}

export interface EvidenceManifestEntry {
  readonly path: string;
  readonly sha256: string;
  readonly bytes?: number;
  readonly role?: string;
  readonly [key: string]: unknown;
}

export interface DispatchAckInput extends BindingIdentities {
  readonly hostTaskId?: string;
  readonly hostBoundTaskId?: string;
  readonly idempotencyKey?: string;
  readonly turn?: string;
  readonly validatorTurnIdAtDispatch?: string;
  readonly turnState?: string;
  readonly [key: string]: unknown;
}

export interface DispatchAck extends BindingIdentities {
  readonly idempotencyKey: string;
  readonly turn: typeof DISPATCH_TURN_UNAVAILABLE;
  readonly ackContentSha256: string;
}

export interface TerminalInput extends Partial<BindingIdentities> {
  readonly ack?: DispatchAck;
  readonly dispatchAck?: DispatchAck;
  readonly taskId?: string;
  readonly turn?: string | null;
  readonly validatorTurnId?: string | null;
  readonly terminalTurnId?: string | null;
  readonly terminalPacketSha256?: string;
  readonly manifest?: readonly EvidenceManifestEntry[];
  readonly evidenceManifest?: readonly EvidenceManifestEntry[];
  readonly manifestSha256?: string;
  readonly evidenceManifestSha256?: string;
  readonly evidenceDigest?: string;
  readonly evidence?: unknown;
  readonly verdict?: unknown;
  readonly idempotencyKey?: string;
  readonly [key: string]: unknown;
}

export interface TerminalPacket extends BindingIdentities {
  readonly idempotencyKey: string;
  readonly ackContentSha256: string;
  readonly turn: string;
  readonly terminalPacketSha256: string;
  readonly manifest: readonly EvidenceManifestEntry[];
  readonly manifestSha256: string;
  readonly evidenceDigest: string;
  readonly evidence: unknown;
  readonly verdict?: unknown;
  readonly terminalContentSha256: string;
}

export interface ResultInput {
  readonly terminal?: TerminalPacket;
  readonly terminalPacket?: TerminalPacket;
  readonly callerIdentity?: { readonly taskId?: string; readonly turn?: string; readonly [key: string]: unknown };
  readonly caller?: { readonly taskId?: string; readonly turn?: string; readonly [key: string]: unknown };
  readonly callerTaskId?: string;
  readonly callerTurnId?: string;
  readonly taskId?: string;
  readonly turn?: string;
  readonly validationId?: string;
  readonly effectId?: string;
  readonly setId?: string;
  readonly controllerGeneration?: number;
  readonly evidence?: unknown;
  readonly manifest?: readonly EvidenceManifestEntry[];
  readonly evidenceManifest?: readonly EvidenceManifestEntry[];
  readonly verdict?: unknown;
  readonly [key: string]: unknown;
}

export interface ResultReceipt {
  readonly validationId: string;
  readonly effectId: string;
  readonly setId: string;
  readonly controllerGeneration: number;
  readonly taskId: string;
  readonly turn: string;
  readonly terminalContentSha256: string;
  readonly evidenceDigest: string;
  readonly verdict?: unknown;
  readonly consumed: true;
  readonly resultContentSha256: string;
}

export const IDENTITY_KEYS = [
  "validationId", "effectId", "setId", "packetFileSha256", "packetContentSha256", "taskId",
] as const;

type RecordValue = Record<string, unknown>;
const SHA256 = /^[0-9a-f]{64}$/u;
const hasOwn = Object.prototype.hasOwnProperty;
function record(value: unknown): value is RecordValue {
  return isPlainJsonObject(value);
}
function own(value: RecordValue, key: string): boolean {
  return hasOwn.call(value, key);
}
function read(value: RecordValue, ...keys: string[]): unknown {
  for (const key of keys) if (own(value, key)) return value[key];
  return undefined;
}
function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function hash(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}
function fail(code: BindingErrorCode, message: string, details: Record<string, unknown> = {}): never {
  throw new BindingError(code, message, details);
}
function canonical(value: unknown, label: string): string {
  try {
    return canonicalSha256(value);
  } catch (error) {
    return fail("INVALID_BINDING_INPUT", `${label} is not canonical JSON`, { cause: String(error) });
  }
}
function cloneFrozen<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const entry of value) cloneFrozen(entry);
    return Object.freeze(value) as T;
  }
  if (record(value)) {
    for (const child of Object.values(value)) cloneFrozen(child);
    return Object.freeze(value) as T;
  }
  return value;
}
function nonEmptyEvidence(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return record(value) && Object.keys(value).length > 0;
}
function validateManifest(value: unknown): readonly EvidenceManifestEntry[] {
  if (!Array.isArray(value) || value.length === 0) {
    return fail("MANIFEST_HASH_OR_ORDER_MISMATCH", "Evidence manifest must be a non-empty ordered array");
  }
  for (const entry of value) {
    if (!record(entry) || !nonEmptyString(entry.path) || !hash(entry.sha256)) {
      return fail("MANIFEST_HASH_OR_ORDER_MISMATCH", "Evidence manifest entry is invalid");
    }
    if (entry.bytes !== undefined && (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0)) {
      return fail("MANIFEST_HASH_OR_ORDER_MISMATCH", "Evidence manifest byte count is invalid");
    }
    if (entry.role !== undefined && !nonEmptyString(entry.role)) {
      return fail("MANIFEST_HASH_OR_ORDER_MISMATCH", "Evidence manifest role is invalid");
    }
  }
  try {
    canonical(value, "evidence manifest");
  } catch (error) {
    return fail("MANIFEST_HASH_OR_ORDER_MISMATCH", String(error));
  }
  return cloneFrozen(value.slice()) as readonly EvidenceManifestEntry[];
}
function validateIdentity(value: unknown): BindingIdentities {
  if (!record(value)) return fail("INVALID_BINDING_INPUT", "Binding identities must be an object");
  for (const key of IDENTITY_KEYS) {
    if (!nonEmptyString(value[key])) return fail("INVALID_BINDING_INPUT", `${key} must be non-empty text`);
  }
  const generation = read(value, "controllerGeneration", "controller_generation");
  if (!Number.isSafeInteger(generation) || (generation as number) < 0) {
    return fail("INVALID_BINDING_INPUT", "controllerGeneration must be a non-negative safe integer");
  }
  if (!hash(value.packetFileSha256) || !hash(value.packetContentSha256)) {
    return fail("INVALID_BINDING_INPUT", "Packet hashes must be SHA-256 values");
  }
  return {
    validationId: value.validationId as string,
    effectId: value.effectId as string,
    setId: value.setId as string,
    packetFileSha256: value.packetFileSha256 as string,
    packetContentSha256: value.packetContentSha256 as string,
    taskId: value.taskId as string,
    controllerGeneration: generation as number,
  };
}
function identityFrom(value: RecordValue): BindingIdentities {
  const nested = read(value, "identities", "bindingIdentities");
  if (nested !== undefined) {
    if (!record(nested)) return fail("INVALID_BINDING_INPUT", "Nested identities must be an object");
    return validateIdentity({ ...nested, ...value });
  }
  return validateIdentity(value);
}
function ackKey(identity: BindingIdentities): string {
  return canonicalSha256([
    identity.effectId, identity.validationId, identity.controllerGeneration,
    identity.taskId, identity.packetContentSha256,
  ].join("|"));
}
function terminalKey(ack: DispatchAck, packetHash: string, manifestHash: string, turn: string): string {
  return canonicalSha256([
    ack.ackContentSha256, ack.validationId, ack.taskId, turn, packetHash, manifestHash,
  ].join("|"));
}
function validateAckShape(value: unknown): value is DispatchAck {
  if (!record(value)) return false;
  if (!nonEmptyString(value.idempotencyKey) || value.turn !== DISPATCH_TURN_UNAVAILABLE
    || !hash(value.ackContentSha256)) return false;
  try {
    const identities = validateIdentity(value);
    const candidate = { ...identities, idempotencyKey: value.idempotencyKey,
      turn: DISPATCH_TURN_UNAVAILABLE, ackContentSha256: value.ackContentSha256 };
    return hashOmittingField(candidate, "ackContentSha256") === value.ackContentSha256;
  } catch {
    return false;
  }
}
function sameJson(left: unknown, right: unknown): boolean {
  try { return canonicalSha256(left) === canonicalSha256(right); } catch { return false; }
}

export class ValidatorAckTerminalBinding {
  private readonly acks = new Map<string, DispatchAck>();
  private readonly terminals = new Map<string, TerminalPacket>();
  private readonly terminalsByAck = new Map<string, TerminalPacket>();
  private readonly results = new Map<string, ResultReceipt>();

  dispatchAck(input: DispatchAckInput): DispatchAck {
    if (!record(input)) return fail("INVALID_BINDING_INPUT", "Dispatch ACK input must be an object");
    const identity = identityFrom(input);
    const suppliedTurn = read(input, "turn", "validatorTurnIdAtDispatch", "validator_turn_id_at_dispatch");
    const turnState = read(input, "turnState", "turn_state");
    if ((suppliedTurn !== undefined && suppliedTurn !== DISPATCH_TURN_UNAVAILABLE)
      || (turnState !== undefined && turnState !== "UNAVAILABLE_AT_DISPATCH")) {
      return fail("ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH", "Dispatch ACK turn must be unavailable");
    }
    if (["verdict", "evidence", "manifest", "evidenceManifest", "terminalPacketSha256", "postimage"]
      .some((key) => own(input, key))) {
      return fail("ACK_WITH_VERDICT_OR_EVIDENCE", "Dispatch ACK cannot contain verdict or evidence");
    }
    const hostTask = read(input, "hostTaskId", "hostBoundTaskId", "host_task_id", "host_bound_task_id");
    const hostReceipt = read(input, "hostDispatchReceipt", "hostSpawnReceipt", "host_dispatch_receipt", "host_spawn_receipt");
    const receiptTask = record(hostReceipt) ? read(hostReceipt, "taskId", "validatorTaskId", "task_id", "validator_task_id") : undefined;
    if (!nonEmptyString(hostTask) || hostTask !== identity.taskId
      || (receiptTask !== undefined && receiptTask !== identity.taskId)) {
      return fail("ACK_TASK_ID_NOT_HOST_BOUND", "Dispatch ACK task ID is not host-bound");
    }
    const derived = ackKey(identity);
    const suppliedKey = read(input, "idempotencyKey", "idempotency_key");
    if (suppliedKey !== undefined && suppliedKey !== derived) {
      return fail("ACK_IDEMPOTENCY_CONFLICT", "Dispatch ACK idempotency key does not bind identity");
    }
    const base = { ...identity, idempotencyKey: derived, turn: DISPATCH_TURN_UNAVAILABLE };
    const ack = withSelfHash(base, "ackContentSha256") as DispatchAck;
    const existing = this.acks.get(derived);
    if (existing !== undefined) {
      if (!sameJson(existing, ack)) return fail("ACK_IDEMPOTENCY_CONFLICT", "Dispatch ACK replay diverges");
      return existing;
    }
    const frozen = cloneFrozen(ack);
    this.acks.set(derived, frozen);
    return frozen;
  }

  emitTerminal(input: TerminalInput): TerminalPacket {
    if (!record(input)) return fail("TERMINAL_BEFORE_ACK", "Terminal input is not an object");
    const suppliedAck = read(input, "ack", "dispatchAck", "dispatch_ack");
    if (!validateAckShape(suppliedAck)) return fail("TERMINAL_BEFORE_ACK", "Terminal requires a prior ACK");
    const ack = this.acks.get(suppliedAck.idempotencyKey);
    if (ack === undefined || !sameJson(ack, suppliedAck)) {
      return fail("TERMINAL_BEFORE_ACK", "Terminal ACK is not bound to this instance");
    }
    const identity = identityFrom({ ...ack, ...input });
    if (identity.taskId !== ack.taskId) return fail("TERMINAL_TASK_ID_MISMATCH", "Terminal task ID differs from ACK");
    if (identity.validationId !== ack.validationId) return fail("TERMINAL_VALIDATION_ID_MISMATCH", "Terminal validation ID differs from ACK");
    if (identity.effectId !== ack.effectId || identity.setId !== ack.setId) {
      return fail("TERMINAL_EFFECT_OR_SET_MISMATCH", "Terminal effect or SET differs from ACK");
    }
    if (identity.controllerGeneration !== ack.controllerGeneration) {
      return fail("STALE_CONTROLLER_GENERATION", "Terminal controller generation is stale");
    }
    if (identity.packetFileSha256 !== ack.packetFileSha256 || identity.packetContentSha256 !== ack.packetContentSha256) {
      return fail("TERMINAL_PACKET_HASH_MISMATCH", "Terminal packet hashes differ from ACK");
    }
    const turn = read(input, "turn", "validatorTurnId", "terminalTurnId", "validator_turn_id");
    if (!nonEmptyString(turn) || turn === DISPATCH_TURN_UNAVAILABLE) {
      return fail("TERMINAL_TURN_NULL_OR_UNAVAILABLE", "Terminal turn must be concrete");
    }
    const manifest = validateManifest(read(input, "manifest", "evidenceManifest", "evidence_manifest"));
    const manifestHash = canonicalSha256(manifest);
    const suppliedManifestHash = read(input, "manifestSha256", "evidenceManifestSha256", "manifest_hash", "evidence_manifest_sha256");
    if (suppliedManifestHash !== undefined && suppliedManifestHash !== manifestHash) {
      return fail("MANIFEST_HASH_OR_ORDER_MISMATCH", "Evidence manifest hash or order differs");
    }
    const suppliedDigest = read(input, "evidenceDigest", "evidence_digest");
    const evidenceDigest = canonicalSha256(manifest);
    if (suppliedDigest !== undefined && suppliedDigest !== evidenceDigest) {
      return fail("MANIFEST_HASH_OR_ORDER_MISMATCH", "Evidence digest differs from ordered manifest");
    }
    const evidence = read(input, "evidence");
    if (!nonEmptyEvidence(evidence)) return fail("POST_TERMINAL_UNDECLARED_EVIDENCE", "Terminal evidence must be non-empty");
    canonical(evidence, "terminal evidence");
    const packetHashValue = read(input, "terminalPacketSha256", "terminal_packet_sha256");
    const terminalPacketSha256 = packetHashValue === undefined
      ? canonicalSha256({ identities: identity, manifestSha256: manifestHash, evidence })
      : packetHashValue;
    if (!hash(terminalPacketSha256)) return fail("TERMINAL_PACKET_HASH_MISMATCH", "Terminal packet hash is invalid");
    const key = terminalKey(ack, terminalPacketSha256, manifestHash, turn);
    const suppliedKey = read(input, "idempotencyKey", "idempotency_key");
    if (suppliedKey !== undefined && suppliedKey !== key) {
      return fail("TERMINAL_IDEMPOTENCY_CONFLICT", "Terminal idempotency key does not bind terminal");
    }
    const base = {
      ...identity, idempotencyKey: key, ackContentSha256: ack.ackContentSha256, turn,
      terminalPacketSha256, manifest, manifestSha256: manifestHash, evidenceDigest,
      evidence: cloneFrozen(evidence), ...(own(input, "verdict") ? { verdict: cloneFrozen(input.verdict) } : {}),
    } as RecordValue;
    const terminal = withSelfHash(base, "terminalContentSha256") as TerminalPacket;
    const existing = this.terminals.get(key);
    if (existing !== undefined) {
      if (!sameJson(existing, terminal)) return fail("TERMINAL_IDEMPOTENCY_CONFLICT", "Terminal replay diverges");
      return existing;
    }
    const priorForAck = this.terminalsByAck.get(ack.idempotencyKey);
    if (priorForAck !== undefined) return fail("VALIDATOR_TERMINAL_CONFLICT", "A second terminal is not permitted for one ACK");
    const frozen = cloneFrozen(terminal);
    this.terminals.set(key, frozen);
    this.terminalsByAck.set(ack.idempotencyKey, frozen);
    return frozen;
  }

  recordResult(input: ResultInput): ResultReceipt {
    if (!record(input)) return fail("RESULT_BEFORE_TERMINAL", "Result input is not an object");
    const suppliedTerminal = read(input, "terminal", "terminalPacket", "terminal_packet");
    if (!record(suppliedTerminal) || !nonEmptyString(suppliedTerminal.terminalContentSha256)) {
      return fail("RESULT_BEFORE_TERMINAL", "Result requires a bound terminal");
    }
    const terminal = this.terminals.get(suppliedTerminal.idempotencyKey as string);
    if (terminal === undefined || !sameJson(terminal, suppliedTerminal)) {
      return fail("RESULT_BEFORE_TERMINAL", "Terminal is not bound to this instance");
    }
    const caller = read(input, "callerIdentity", "caller");
    const callerTask = record(caller) ? read(caller, "taskId", "task_id") : read(input, "callerTaskId", "caller_task_id", "taskId", "task_id");
    const callerTurn = record(caller) ? read(caller, "turn", "turnId", "turn_id") : read(input, "callerTurnId", "caller_turn_id", "turn");
    if (callerTask !== terminal.taskId || callerTurn !== terminal.turn) {
      return fail("CALLER_IDENTITY_SUBSTITUTION", "Result caller identity differs from terminal");
    }
    for (const [key, expected] of [["validationId", terminal.validationId], ["effectId", terminal.effectId], ["setId", terminal.setId]] as const) {
      const supplied = read(input, key, key.replace(/[A-Z]/gu, (match) => `_${match.toLowerCase()}`));
      if (supplied !== undefined && supplied !== expected) return fail("CALLER_IDENTITY_SUBSTITUTION", `Result ${key} differs from terminal`);
    }
    const generation = read(input, "controllerGeneration", "controller_generation");
    if (generation !== undefined && generation !== terminal.controllerGeneration) {
      return fail("STALE_CONTROLLER_GENERATION", "Result controller generation differs from terminal");
    }
    const evidence = read(input, "evidence");
    if (!nonEmptyEvidence(evidence) || !sameJson(evidence, terminal.evidence)) {
      if (this.results.has(terminal.terminalContentSha256)) return fail("RESULT_DUPLICATE_CONFLICT", "Duplicate result evidence differs");
      return fail("POST_TERMINAL_UNDECLARED_EVIDENCE", "Result evidence is not the terminal evidence");
    }
    const manifest = read(input, "manifest", "evidenceManifest", "evidence_manifest");
    if (manifest !== undefined && !sameJson(manifest, terminal.manifest)) {
      return fail("POST_TERMINAL_UNDECLARED_EVIDENCE", "Result adds undeclared evidence");
    }
    if (own(input, "verdict") && !sameJson(input.verdict, terminal.verdict)) {
      return fail("RESULT_DUPLICATE_CONFLICT", "Result verdict differs from terminal");
    }
    const base = {
      validationId: terminal.validationId, effectId: terminal.effectId, setId: terminal.setId,
      controllerGeneration: terminal.controllerGeneration, taskId: terminal.taskId, turn: terminal.turn,
      terminalContentSha256: terminal.terminalContentSha256, evidenceDigest: terminal.evidenceDigest,
      ...(own(terminal, "verdict") ? { verdict: terminal.verdict } : {}), consumed: true as const,
    } as RecordValue;
    const receipt = withSelfHash(base, "resultContentSha256") as ResultReceipt;
    const existing = this.results.get(terminal.terminalContentSha256);
    if (existing !== undefined) {
      if (!sameJson(existing, receipt)) return fail("RESULT_DUPLICATE_CONFLICT", "Result replay diverges");
      return existing;
    }
    const frozen = cloneFrozen(receipt);
    this.results.set(terminal.terminalContentSha256, frozen);
    return frozen;
  }

  validateLegacyForwardBind(input: { readonly legacyForwardBind: boolean; readonly manifestPreexisted: boolean; readonly manifest?: unknown }): true {
    if (!record(input) || typeof input.legacyForwardBind !== "boolean" || typeof input.manifestPreexisted !== "boolean") {
      return fail("INVALID_BINDING_INPUT", "Legacy forward-bind input is invalid");
    }
    if (input.legacyForwardBind && input.manifestPreexisted && input.manifest === undefined) {
      return fail("LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED", "A pre-existing manifest must be supplied");
    }
    if (input.manifest !== undefined) validateManifest(input.manifest);
    return true;
  }
}

export const ValidatorBinding = ValidatorAckTerminalBinding;
