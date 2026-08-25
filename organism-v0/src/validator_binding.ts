import { createHash } from "node:crypto";

export const DISPATCH_TURN_UNAVAILABLE = "unavailable" as const;

export type BindingErrorCode =
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
  | "LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED"
  | "INVALID_BINDING_INPUT"
  | "INVALID_IDEMPOTENCY_KEY"
  | "TERMINAL_NOT_FOUND";

export class BindingError extends Error {
  readonly code: BindingErrorCode;

  constructor(code: BindingErrorCode) {
    super(code);
    this.name = "BindingError";
    this.code = code;
  }
}

export interface BindingIdentities {
  readonly validationId: string;
  readonly effectId: string;
  readonly setId: string;
  readonly controllerGeneration: number;
  readonly packetFileSha256: string;
  readonly packetContentSha256: string;
  readonly taskId: string;
}

export interface DispatchAckInput extends BindingIdentities {
  readonly idempotencyKey: string;
  readonly turn: string;
  readonly verdict?: unknown;
  readonly evidence?: unknown;
}

export interface DispatchAck extends BindingIdentities {
  readonly kind: "dispatch_ack";
  readonly idempotencyKey: string;
  readonly turn: typeof DISPATCH_TURN_UNAVAILABLE;
}

export interface ManifestBinding {
  readonly sha256: string;
  readonly order: readonly string[];
}

export type EvidenceItem = Readonly<Record<string, unknown>>;

export interface TerminalInput extends BindingIdentities {
  readonly ackIdempotencyKey: string;
  readonly idempotencyKey: string;
  readonly turn: string;
  readonly callerId: string;
  readonly manifest: ManifestBinding;
  readonly evidence: readonly EvidenceItem[];
}

export interface TerminalPacket extends BindingIdentities {
  readonly kind: "terminal";
  readonly ackIdempotencyKey: string;
  readonly idempotencyKey: string;
  readonly turn: string;
  readonly callerId: string;
  readonly manifest: ManifestBinding;
  readonly evidence: readonly EvidenceItem[];
}

export interface ResultInput {
  readonly terminalIdempotencyKey: string;
  readonly callerId: string;
  readonly evidence: readonly EvidenceItem[];
}

export interface ResultReceipt extends BindingIdentities {
  readonly kind: "result";
  readonly terminalIdempotencyKey: string;
  readonly callerId: string;
  readonly consumed: true;
  readonly evidence: readonly EvidenceItem[];
}

const SHA256 = /^[0-9a-f]{64}$/;
const HOST_TASK = /^\/(?:root|home)\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const IDENTITY_KEYS: readonly (keyof BindingIdentities)[] = [
  "validationId",
  "effectId",
  "setId",
  "controllerGeneration",
  "packetFileSha256",
  "packetContentSha256",
  "taskId",
];

function own(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new BindingError("INVALID_BINDING_INPUT");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  throw new BindingError("INVALID_BINDING_INPUT");
}

function copy<T>(value: T): T {
  return JSON.parse(canonical(value)) as T;
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function requireText(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0) throw new BindingError("INVALID_BINDING_INPUT");
}

function validateIdentity(input: BindingIdentities): void {
  if (input === null || typeof input !== "object") throw new BindingError("INVALID_BINDING_INPUT");
  for (const key of IDENTITY_KEYS) requireText(input[key]);
  if (!Number.isSafeInteger(input.controllerGeneration) || input.controllerGeneration < 0) {
    throw new BindingError("STALE_CONTROLLER_GENERATION");
  }
  if (!SHA256.test(input.packetFileSha256) || !SHA256.test(input.packetContentSha256)) {
    throw new BindingError("INVALID_BINDING_INPUT");
  }
}

function validateManifest(manifest: ManifestBinding): ManifestBinding {
  if (manifest === null || typeof manifest !== "object" || !Array.isArray(manifest.order)) {
    throw new BindingError("MANIFEST_HASH_OR_ORDER_MISMATCH");
  }
  if (!SHA256.test(manifest.sha256) || manifest.order.length === 0) {
    throw new BindingError("MANIFEST_HASH_OR_ORDER_MISMATCH");
  }
  const order = manifest.order.map((path) => {
    if (typeof path !== "string" || path.length === 0) throw new BindingError("MANIFEST_HASH_OR_ORDER_MISMATCH");
    return path;
  });
  if (new Set(order).size !== order.length) throw new BindingError("MANIFEST_HASH_OR_ORDER_MISMATCH");
  const expected = createHash("sha256").update(canonical(order)).digest("hex");
  if (expected !== manifest.sha256) throw new BindingError("MANIFEST_HASH_OR_ORDER_MISMATCH");
  return { sha256: manifest.sha256, order };
}

function validateEvidence(evidence: readonly EvidenceItem[]): EvidenceItem[] {
  if (!Array.isArray(evidence) || evidence.length === 0) throw new BindingError("INVALID_BINDING_INPUT");
  return evidence.map((item) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new BindingError("INVALID_BINDING_INPUT");
    }
    return copy(item);
  });
}

function same(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

export class ValidatorAckTerminalBinding {
  private readonly acks = new Map<string, DispatchAck>();
  private readonly terminals = new Map<string, TerminalPacket>();
  private readonly consumed = new Set<string>();

  dispatchAck(input: DispatchAckInput): DispatchAck {
    validateIdentity(input);
    requireText(input.idempotencyKey);
    if (!HOST_TASK.test(input.taskId)) throw new BindingError("ACK_TASK_ID_NOT_HOST_BOUND");
    if (input.turn !== DISPATCH_TURN_UNAVAILABLE) {
      throw new BindingError("ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH");
    }
    if (own(input, "verdict") || own(input, "evidence")) {
      throw new BindingError("ACK_WITH_VERDICT_OR_EVIDENCE");
    }
    const ack = {
      kind: "dispatch_ack" as const,
      validationId: input.validationId,
      effectId: input.effectId,
      setId: input.setId,
      controllerGeneration: input.controllerGeneration,
      packetFileSha256: input.packetFileSha256,
      packetContentSha256: input.packetContentSha256,
      taskId: input.taskId,
      idempotencyKey: input.idempotencyKey,
      turn: DISPATCH_TURN_UNAVAILABLE,
    } satisfies DispatchAck;
    const prior = this.acks.get(ack.idempotencyKey);
    if (prior !== undefined) {
      if (!same(prior, ack)) throw new BindingError("ACK_IDEMPOTENCY_CONFLICT");
      return prior;
    }
    const retained = freeze(copy(ack));
    this.acks.set(ack.idempotencyKey, retained);
    return retained;
  }

  emitTerminal(input: TerminalInput): TerminalPacket {
    requireText(input.ackIdempotencyKey);
    requireText(input.idempotencyKey);
    const ack = this.acks.get(input.ackIdempotencyKey);
    if (ack === undefined) throw new BindingError("TERMINAL_BEFORE_ACK");
    validateIdentity(input);
    if (input.validationId !== ack.validationId) throw new BindingError("TERMINAL_VALIDATION_ID_MISMATCH");
    if (input.effectId !== ack.effectId || input.setId !== ack.setId) {
      throw new BindingError("TERMINAL_EFFECT_OR_SET_MISMATCH");
    }
    if (input.controllerGeneration !== ack.controllerGeneration) {
      throw new BindingError("STALE_CONTROLLER_GENERATION");
    }
    if (input.taskId !== ack.taskId) throw new BindingError("TERMINAL_TASK_ID_MISMATCH");
    if (input.packetFileSha256 !== ack.packetFileSha256 || input.packetContentSha256 !== ack.packetContentSha256) {
      throw new BindingError("TERMINAL_PACKET_HASH_MISMATCH");
    }
    if (input.turn === DISPATCH_TURN_UNAVAILABLE || input.turn === null || input.turn.length === 0) {
      throw new BindingError("TERMINAL_TURN_NULL_OR_UNAVAILABLE");
    }
    requireText(input.callerId);
    const manifest = validateManifest(input.manifest);
    const evidence = validateEvidence(input.evidence);
    const terminal = {
      kind: "terminal" as const,
      validationId: ack.validationId,
      effectId: ack.effectId,
      setId: ack.setId,
      controllerGeneration: ack.controllerGeneration,
      packetFileSha256: ack.packetFileSha256,
      packetContentSha256: ack.packetContentSha256,
      taskId: ack.taskId,
      ackIdempotencyKey: ack.idempotencyKey,
      idempotencyKey: input.idempotencyKey,
      turn: input.turn,
      callerId: input.callerId,
      manifest,
      evidence,
    } satisfies TerminalPacket;
    const prior = this.terminals.get(terminal.idempotencyKey);
    if (prior !== undefined) {
      if (!same(prior, terminal)) throw new BindingError("TERMINAL_IDEMPOTENCY_CONFLICT");
      return prior;
    }
    const retained = freeze(copy(terminal));
    this.terminals.set(terminal.idempotencyKey, retained);
    return retained;
  }

  recordResult(input: ResultInput): ResultReceipt {
    requireText(input.terminalIdempotencyKey);
    const terminal = this.terminals.get(input.terminalIdempotencyKey);
    if (terminal === undefined) throw new BindingError("TERMINAL_NOT_FOUND");
    if (this.consumed.has(input.terminalIdempotencyKey)) throw new BindingError("DUPLICATE_RECORD_RESULT");
    if (input.callerId !== terminal.callerId) throw new BindingError("CALLER_IDENTITY_SUBSTITUTION");
    if (!same(input.evidence, terminal.evidence)) {
      throw new BindingError("POST_TERMINAL_UNDECLARED_EVIDENCE");
    }
    const receipt = {
      kind: "result" as const,
      validationId: terminal.validationId,
      effectId: terminal.effectId,
      setId: terminal.setId,
      controllerGeneration: terminal.controllerGeneration,
      packetFileSha256: terminal.packetFileSha256,
      packetContentSha256: terminal.packetContentSha256,
      taskId: terminal.taskId,
      terminalIdempotencyKey: terminal.idempotencyKey,
      callerId: terminal.callerId,
      consumed: true as const,
      evidence: terminal.evidence,
    } satisfies ResultReceipt;
    this.consumed.add(input.terminalIdempotencyKey);
    return freeze(copy(receipt));
  }

  validateLegacyForwardBind(input: {
    readonly legacyForwardBind: boolean;
    readonly manifestPreexisted: boolean;
    readonly manifest?: unknown;
  }): true {
    if (input.legacyForwardBind && input.manifestPreexisted && input.manifest === undefined) {
      throw new BindingError("LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED");
    }
    return true;
  }
}
