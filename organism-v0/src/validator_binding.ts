import { createHash } from "node:crypto";

export const DISPATCH_TURN_UNAVAILABLE = "unavailable" as const;

export type BindingErrorCode =
  | "INVALID_BINDING_IDENTITIES"
  | "INVALID_INPUT"
  | "INVALID_MANIFEST"
  | "INVALID_TURN"
  | "EVIDENCE_REQUIRED"
  | "ACK_NOT_FOUND"
  | "TERMINAL_NOT_FOUND"
  | "DIVERGENT_REPLAY"
  | "DUPLICATE_RESULT"
  | "LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED";

export class BindingError extends Error {
  readonly code: BindingErrorCode;

  constructor(code: BindingErrorCode, message = code) {
    super(message);
    this.name = "BindingError";
    this.code = code;
  }
}

/** The six string identities which bind a dispatch to its authorized packet. */
export interface BindingIdentities {
  validationId?: string;
  effectId?: string;
  setId?: string;
  packetFileSha256?: string;
  packetContentSha256?: string;
  hostTaskId?: string;
  hostTask?: string;
  [key: string]: unknown;
}

export interface DispatchAckInput extends BindingIdentities {
  identities?: BindingIdentities;
  idempotencyKey?: string;
  idempotency?: string;
  turn?: unknown;
}

export interface DispatchAck {
  type: "dispatch_ack";
  identities: Required<Pick<BindingIdentities,
    "validationId" | "effectId" | "setId" | "packetFileSha256" | "packetContentSha256" | "hostTaskId">> &
    { controllerGeneration: number };
  idempotencyKey: string;
  turn: typeof DISPATCH_TURN_UNAVAILABLE;
  [key: string]: unknown;
}

export interface TerminalInput {
  ack?: DispatchAck;
  dispatchAck?: DispatchAck;
  terminalAck?: DispatchAck;
  identities?: BindingIdentities;
  idempotencyKey?: string;
  turn?: string | number;
  workerTurn?: string | number;
  manifest?: readonly unknown[];
  manifestHash?: string;
  orderedManifestHash?: string;
  evidence?: unknown;
  [key: string]: unknown;
}

export interface TerminalPacket {
  type: "terminal_packet";
  identities: DispatchAck["identities"];
  idempotencyKey: string;
  turn: string | number;
  manifest: readonly unknown[];
  manifestSha256: string;
  evidence: unknown;
  [key: string]: unknown;
}

export interface ResultInput {
  terminal?: TerminalPacket;
  terminalPacket?: TerminalPacket;
  result?: unknown;
  verdict?: unknown;
  evidence?: unknown;
  [key: string]: unknown;
}

export interface ResultReceipt {
  type: "result_receipt";
  idempotencyKey: string;
  terminal: TerminalPacket;
  [key: string]: unknown;
}

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function valueFrom(input: AnyRecord, names: readonly string[]): unknown {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(input, name)) return input[name];
  }
  return undefined;
}

function canonical(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  throw new BindingError("INVALID_INPUT", "Unsupported value in binding");
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  if (isRecord(value)) {
    const result: AnyRecord = {};
    for (const key of Object.keys(value)) result[key] = clone(value[key]);
    return result as T;
  }
  return value;
}

function freeze<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach((item) => freeze(item));
    return Object.freeze(value);
  }
  if (isRecord(value)) {
    Object.keys(value).forEach((key) => freeze(value[key]));
    return Object.freeze(value);
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function nonEmptyEvidence(value: unknown): boolean {
  if (nonEmptyString(value)) return true;
  if (Array.isArray(value)) return value.length > 0;
  return isRecord(value) && Object.keys(value).length > 0;
}

function concreteTurn(value: unknown): value is string | number {
  if (nonEmptyString(value)) return value !== DISPATCH_TURN_UNAVAILABLE;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function addAlias(target: AnyRecord, name: string, value: unknown): void {
  Object.defineProperty(target, name, { configurable: false, enumerable: false, value });
}

export class ValidatorAckTerminalBinding {
  private readonly acks = new Map<string, DispatchAck>();
  private readonly terminals = new Map<string, TerminalPacket>();
  private readonly results = new Map<string, ResultReceipt>();
  private readonly resultFingerprints = new Map<string, string>();

  dispatchAck(input: DispatchAckInput): DispatchAck {
    if (!isRecord(input)) throw new BindingError("INVALID_INPUT");
    const nested = isRecord(input.identities) ? input.identities : {};
    const source: AnyRecord = { ...nested, ...input };
    const identities = this.readIdentities(source);
    const idempotencyKey = valueFrom(source, ["idempotencyKey", "idempotency"]);
    if (!nonEmptyString(idempotencyKey)) {
      throw new BindingError("INVALID_BINDING_IDENTITIES", "idempotencyKey must be non-empty");
    }
    if (input.turn !== undefined && input.turn !== DISPATCH_TURN_UNAVAILABLE) {
      throw new BindingError("INVALID_TURN", "Dispatch ACK turn is unavailable");
    }
    const fingerprint = canonical({ identities, idempotencyKey });
    const prior = this.acks.get(idempotencyKey);
    if (prior) {
      if (canonical({ identities: prior.identities, idempotencyKey: prior.idempotencyKey }) !== fingerprint) {
        throw new BindingError("DIVERGENT_REPLAY", "ACK idempotency key was reused with different binding");
      }
      return prior;
    }
    const ackRecord: AnyRecord = {
      type: "dispatch_ack",
      identities: Object.freeze(identities),
      idempotencyKey,
      turn: DISPATCH_TURN_UNAVAILABLE,
    };
    addAlias(ackRecord, "binding", identities);
    for (const [key, value] of Object.entries(identities)) addAlias(ackRecord, key, value);
    const ack = Object.freeze(ackRecord) as DispatchAck;
    this.acks.set(idempotencyKey, ack);
    return ack;
  }

  emitTerminal(input: TerminalInput): TerminalPacket {
    if (!isRecord(input)) throw new BindingError("INVALID_INPUT");
    const ack = input.ack ?? input.dispatchAck ?? input.terminalAck;
    const idempotencyKey = input.idempotencyKey ?? ack?.idempotencyKey;
    if (!ack || !nonEmptyString(idempotencyKey)) throw new BindingError("ACK_NOT_FOUND");
    const storedAck = this.acks.get(idempotencyKey);
    if (!storedAck || canonical(storedAck) !== canonical(ack)) throw new BindingError("ACK_NOT_FOUND");
    const turn = input.turn ?? input.workerTurn;
    if (!concreteTurn(turn)) throw new BindingError("INVALID_TURN", "Terminal turn must be concrete");
    if (!Array.isArray(input.manifest)) throw new BindingError("INVALID_MANIFEST");
    if (!nonEmptyEvidence(input.evidence)) throw new BindingError("EVIDENCE_REQUIRED");
    const manifest = freeze(clone(input.manifest));
    const evidence = freeze(clone(input.evidence));
    const computedManifestHash = digest(manifest);
    const suppliedHash = input.manifestHash ?? input.orderedManifestHash;
    if (suppliedHash !== undefined && (!nonEmptyString(suppliedHash) || suppliedHash !== computedManifestHash)) {
      throw new BindingError("INVALID_MANIFEST", "Manifest hash does not bind the ordered manifest");
    }
    const terminalRecord: AnyRecord = {
      type: "terminal_packet",
      identities: storedAck.identities,
      idempotencyKey,
      turn,
      manifest,
      manifestSha256: suppliedHash ?? computedManifestHash,
      evidence,
    };
    addAlias(terminalRecord, "ack", storedAck);
    addAlias(terminalRecord, "binding", storedAck.identities);
    const terminal = Object.freeze(terminalRecord) as TerminalPacket;
    const fingerprint = canonical(terminal);
    const prior = this.terminals.get(idempotencyKey);
    if (prior) {
      if (canonical(prior) !== fingerprint) throw new BindingError("DIVERGENT_REPLAY", "Terminal replay diverged");
      return prior;
    }
    this.terminals.set(idempotencyKey, terminal);
    return terminal;
  }

  recordResult(input: ResultInput): ResultReceipt {
    if (!isRecord(input)) throw new BindingError("INVALID_INPUT");
    const terminal = input.terminal ?? input.terminalPacket;
    if (!terminal || !nonEmptyString(terminal.idempotencyKey)) throw new BindingError("TERMINAL_NOT_FOUND");
    const stored = this.terminals.get(terminal.idempotencyKey);
    if (!stored || canonical(stored) !== canonical(terminal)) throw new BindingError("TERMINAL_NOT_FOUND");
    const resultEvidence = input.evidence === undefined ? stored.evidence : input.evidence;
    if (!nonEmptyEvidence(resultEvidence)) throw new BindingError("EVIDENCE_REQUIRED");
    const result = input.result === undefined ? input.verdict : input.result;
    const receiptData = {
      type: "result_receipt" as const,
      idempotencyKey: stored.idempotencyKey,
      terminal: stored,
      ...(result === undefined ? {} : { result: freeze(clone(result)) }),
      evidence: freeze(clone(resultEvidence)),
    };
    const fingerprint = canonical(receiptData);
    const prior = this.results.get(stored.idempotencyKey);
    if (prior) {
      if (this.resultFingerprints.get(stored.idempotencyKey) !== fingerprint) {
        throw new BindingError("DIVERGENT_REPLAY", "Result replay diverged");
      }
      return prior;
    }
    const receipt = Object.freeze(receiptData) as ResultReceipt;
    this.results.set(stored.idempotencyKey, receipt);
    this.resultFingerprints.set(stored.idempotencyKey, fingerprint);
    return receipt;
  }

  validateLegacyForwardBind(input: {
    legacyForwardBind: boolean;
    manifestPreexisted: boolean;
    manifest?: unknown;
  }): true {
    if (input.legacyForwardBind && input.manifestPreexisted && input.manifest === undefined) {
      throw new BindingError(
        "LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED",
        "Legacy forward bind cannot pretend that a pre-existing manifest was supplied",
      );
    }
    if (input.manifestPreexisted && input.manifest === undefined) {
      throw new BindingError("INVALID_MANIFEST", "A pre-existing manifest must be supplied");
    }
    if (input.manifest !== undefined && !Array.isArray(input.manifest)) {
      throw new BindingError("INVALID_MANIFEST");
    }
    return true;
  }

  private readIdentities(input: AnyRecord): DispatchAck["identities"] {
    const validationId = valueFrom(input, ["validationId", "validation_id", "validation"]);
    const effectId = valueFrom(input, ["effectId", "effect_id", "effect"]);
    const setId = valueFrom(input, ["setId", "set_id", "set"]);
    const packetFileSha256 = valueFrom(input, ["packetFileSha256", "packet_file_sha256", "fileSha256"]);
    const packetContentSha256 = valueFrom(input, ["packetContentSha256", "packet_content_sha256", "contentSha256"]);
    const hostTaskId = valueFrom(input, ["hostTaskId", "hostTask", "hostBoundTask", "workerTask", "workerTaskId"]);
    const generation = valueFrom(input, ["controllerGeneration", "controller_generation", "generation"]);
    if (![validationId, effectId, setId, packetFileSha256, packetContentSha256, hostTaskId].every(nonEmptyString) ||
        typeof generation !== "number" || !Number.isSafeInteger(generation) || generation < 0) {
      throw new BindingError("INVALID_BINDING_IDENTITIES", "Binding identities are incomplete or invalid");
    }
    return {
      validationId: validationId as string,
      effectId: effectId as string,
      setId: setId as string,
      controllerGeneration: generation as number,
      packetFileSha256: packetFileSha256 as string,
      packetContentSha256: packetContentSha256 as string,
      hostTaskId: hostTaskId as string,
    };
  }
}
