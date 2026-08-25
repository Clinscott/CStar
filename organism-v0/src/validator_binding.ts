import { createHash } from "node:crypto";

export const ACK_WORKER_TURN = "unavailable" as const;

export type WorkerTurn = string | number;

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
  | "RESULT_BEFORE_TERMINAL"
  | "INVALID_BINDING_INPUT";

export class ValidatorBindingError extends Error {
  readonly code: BindingErrorCode;

  constructor(code: BindingErrorCode, message = code) {
    super(message);
    this.name = "ValidatorBindingError";
    this.code = code;
  }
}

export interface EvidenceItem {
  evidence_id: string;
  evidence_hash: string;
}

export interface BindingIdentity {
  validation_id: string;
  effect_id: string;
  set_id: string;
  controller_generation: number;
  packet_file_sha256: string;
  packet_content_sha256: string;
  manifest_hash: string;
  evidence_order: readonly string[];
}

export interface DispatchAckInput extends BindingIdentity {
  worker_task: string;
  worker_turn: typeof ACK_WORKER_TURN;
}

export interface DispatchAck extends DispatchAckInput {
  readonly ack_hash: string;
}

export interface TerminalInput extends BindingIdentity {
  worker_task: string;
  worker_turn: WorkerTurn;
  evidence: readonly EvidenceItem[];
  terminal_hash?: string;
  caller_identity?: string;
}

export interface Terminal extends Omit<TerminalInput, "terminal_hash"> {
  readonly terminal_hash: string;
}

export interface ResultInput {
  validation_id: string;
  terminal_hash?: string;
  evidence?: readonly EvidenceItem[];
  caller_identity?: string;
}

export interface RecordedResult {
  readonly validation_id: string;
  readonly terminal_hash: string;
  readonly evidence: readonly EvidenceItem[];
  readonly consumed: true;
}

type MutableRecord = {
  ack?: DispatchAck;
  ackSignature?: string;
  terminal?: Terminal;
  terminalSignature?: string;
  resultConsumed: boolean;
};

type RecordInput = Record<string, unknown>;

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function canonical(value: unknown): string {
  if (value === undefined) {
    throw new ValidatorBindingError("INVALID_BINDING_INPUT", "undefined is not canonicalizable");
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ValidatorBindingError("INVALID_BINDING_INPUT", "non-finite number is not canonicalizable");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonical(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  throw new ValidatorBindingError("INVALID_BINDING_INPUT", "unsupported canonical value");
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

function assertString(value: unknown, code: BindingErrorCode): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ValidatorBindingError(code);
  }
}

function assertIdentity(input: RecordInput): asserts input is RecordInput & BindingIdentity {
  for (const key of [
    "validation_id",
    "effect_id",
    "set_id",
    "packet_file_sha256",
    "packet_content_sha256",
    "manifest_hash",
  ]) {
    assertString(input[key], "INVALID_BINDING_INPUT");
  }
  if (!Number.isInteger(input.controller_generation) || (input.controller_generation as number) < 0) {
    throw new ValidatorBindingError("INVALID_BINDING_INPUT");
  }
  if (!Array.isArray(input.evidence_order) || input.evidence_order.some((item) => typeof item !== "string")) {
    throw new ValidatorBindingError("INVALID_BINDING_INPUT");
  }
}

function identityOf(input: BindingIdentity): BindingIdentity {
  return {
    validation_id: input.validation_id,
    effect_id: input.effect_id,
    set_id: input.set_id,
    controller_generation: input.controller_generation,
    packet_file_sha256: input.packet_file_sha256,
    packet_content_sha256: input.packet_content_sha256,
    manifest_hash: input.manifest_hash,
    evidence_order: [...input.evidence_order],
  };
}

function assertEvidence(evidence: unknown): asserts evidence is readonly EvidenceItem[] {
  if (!Array.isArray(evidence)) {
    throw new ValidatorBindingError("INVALID_BINDING_INPUT");
  }
  for (const item of evidence) {
    if (
      item === null ||
      typeof item !== "object" ||
      typeof (item as RecordInput).evidence_id !== "string" ||
      typeof (item as RecordInput).evidence_hash !== "string"
    ) {
      throw new ValidatorBindingError("INVALID_BINDING_INPUT");
    }
  }
}

function sameEvidence(left: readonly EvidenceItem[], right: readonly EvidenceItem[]): boolean {
  return canonical(left) === canonical(right);
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function assertHostBoundTask(task: unknown): asserts task is string {
  if (typeof task !== "string" || !/^\/root\/[A-Za-z0-9_.-]+$/.test(task)) {
    throw new ValidatorBindingError("ACK_TASK_ID_NOT_HOST_BOUND");
  }
}

function assertConcreteTurn(turn: unknown): asserts turn is WorkerTurn {
  if (turn === null || turn === undefined || turn === ACK_WORKER_TURN) {
    throw new ValidatorBindingError("TERMINAL_TURN_NULL_OR_UNAVAILABLE");
  }
  if (typeof turn === "string" && turn.trim().length === 0) {
    throw new ValidatorBindingError("TERMINAL_TURN_NULL_OR_UNAVAILABLE");
  }
  if (typeof turn === "number" && (!Number.isFinite(turn) || !Number.isInteger(turn) || turn < 0)) {
    throw new ValidatorBindingError("TERMINAL_TURN_NULL_OR_UNAVAILABLE");
  }
  if (typeof turn !== "string" && typeof turn !== "number") {
    throw new ValidatorBindingError("TERMINAL_TURN_NULL_OR_UNAVAILABLE");
  }
}

function checkManifest(ack: DispatchAck, terminal: TerminalInput): void {
  if (ack.manifest_hash !== terminal.manifest_hash || !sameOrder(ack.evidence_order, terminal.evidence_order)) {
    throw new ValidatorBindingError("MANIFEST_HASH_OR_ORDER_MISMATCH");
  }
  const terminalEvidenceOrder = terminal.evidence.map((item) => item.evidence_id);
  if (!sameOrder(terminal.evidence_order, terminalEvidenceOrder)) {
    throw new ValidatorBindingError("MANIFEST_HASH_OR_ORDER_MISMATCH");
  }
}

function withoutTerminalHash(input: TerminalInput): RecordInput {
  const { terminal_hash: _terminalHash, ...withoutHash } = input;
  return withoutHash as RecordInput;
}

export class ValidatorBinding {
  private readonly record: MutableRecord = { resultConsumed: false };

  bindDispatchAck(input: DispatchAckInput): DispatchAck {
    const candidate = input as unknown as RecordInput;
    assertIdentity(candidate);
    if (hasOwn(candidate, "verdict") || hasOwn(candidate, "evidence")) {
      throw new ValidatorBindingError("ACK_WITH_VERDICT_OR_EVIDENCE");
    }
    assertHostBoundTask(candidate.worker_task);
    if (candidate.worker_turn !== ACK_WORKER_TURN) {
      throw new ValidatorBindingError("ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH");
    }

    const identity = identityOf(candidate);
    const signature = canonical({ ...identity, worker_task: candidate.worker_task, worker_turn: candidate.worker_turn });
    if (this.record.ack) {
      if (this.record.ackSignature === signature) {
        return clone(this.record.ack);
      }
      throw new ValidatorBindingError("ACK_IDEMPOTENCY_CONFLICT");
    }

    const ack = {
      ...identity,
      worker_task: candidate.worker_task,
      worker_turn: ACK_WORKER_TURN,
      ack_hash: sha256({ ...identity, worker_task: candidate.worker_task, worker_turn: ACK_WORKER_TURN }),
    } as DispatchAck;
    this.record.ack = clone(ack);
    this.record.ackSignature = signature;
    return clone(ack);
  }

  bindTerminal(input: TerminalInput): Terminal {
    const candidate = input as unknown as RecordInput;
    if (!this.record.ack) {
      throw new ValidatorBindingError("TERMINAL_BEFORE_ACK");
    }
    assertIdentity(candidate);
    assertEvidence(candidate.evidence);
    if (hasOwn(candidate, "caller_identity") && candidate.caller_identity !== this.record.ack.worker_task) {
      throw new ValidatorBindingError("CALLER_IDENTITY_SUBSTITUTION");
    }
    if (candidate.controller_generation !== this.record.ack.controller_generation) {
      throw new ValidatorBindingError("STALE_CONTROLLER_GENERATION");
    }
    if (candidate.validation_id !== this.record.ack.validation_id) {
      throw new ValidatorBindingError("TERMINAL_VALIDATION_ID_MISMATCH");
    }
    if (candidate.effect_id !== this.record.ack.effect_id || candidate.set_id !== this.record.ack.set_id) {
      throw new ValidatorBindingError("TERMINAL_EFFECT_OR_SET_MISMATCH");
    }
    if (candidate.worker_task !== this.record.ack.worker_task) {
      throw new ValidatorBindingError("TERMINAL_TASK_ID_MISMATCH");
    }
    if (
      candidate.packet_file_sha256 !== this.record.ack.packet_file_sha256 ||
      candidate.packet_content_sha256 !== this.record.ack.packet_content_sha256
    ) {
      throw new ValidatorBindingError("TERMINAL_PACKET_HASH_MISMATCH");
    }
    assertConcreteTurn(candidate.worker_turn);
    checkManifest(this.record.ack, candidate as unknown as TerminalInput);

    let computedHash: string;
    try {
      computedHash = sha256(withoutTerminalHash(candidate as unknown as TerminalInput));
    } catch (error) {
      if (error instanceof ValidatorBindingError && error.code === "INVALID_BINDING_INPUT") {
        throw new ValidatorBindingError("TERMINAL_PACKET_HASH_MISMATCH");
      }
      throw error;
    }
    if (candidate.terminal_hash !== undefined && candidate.terminal_hash !== computedHash) {
      throw new ValidatorBindingError("TERMINAL_PACKET_HASH_MISMATCH");
    }

    const terminal = {
      ...identityOf(candidate),
      worker_task: candidate.worker_task,
      worker_turn: candidate.worker_turn,
      evidence: clone(candidate.evidence),
      terminal_hash: computedHash,
    } as Terminal;
    const signature = canonical(withoutTerminalHash(candidate as unknown as TerminalInput));
    if (this.record.terminal) {
      if (this.record.terminalSignature === signature) {
        return clone(this.record.terminal);
      }
      throw new ValidatorBindingError("TERMINAL_IDEMPOTENCY_CONFLICT");
    }
    this.record.terminal = clone(terminal);
    this.record.terminalSignature = signature;
    return clone(terminal);
  }

  recordResult(input: ResultInput): RecordedResult {
    if (!this.record.ack) {
      throw new ValidatorBindingError("TERMINAL_BEFORE_ACK");
    }
    if (!this.record.terminal) {
      throw new ValidatorBindingError("RESULT_BEFORE_TERMINAL");
    }
    if (this.record.resultConsumed) {
      throw new ValidatorBindingError("DUPLICATE_RECORD_RESULT");
    }
    const candidate = input as unknown as RecordInput;
    assertString(candidate.validation_id, "TERMINAL_VALIDATION_ID_MISMATCH");
    if (hasOwn(candidate, "caller_identity") && candidate.caller_identity !== this.record.ack.worker_task) {
      throw new ValidatorBindingError("CALLER_IDENTITY_SUBSTITUTION");
    }
    if (candidate.validation_id !== this.record.ack.validation_id) {
      throw new ValidatorBindingError("TERMINAL_VALIDATION_ID_MISMATCH");
    }
    if (candidate.terminal_hash !== undefined && candidate.terminal_hash !== this.record.terminal.terminal_hash) {
      throw new ValidatorBindingError("TERMINAL_PACKET_HASH_MISMATCH");
    }
    if (candidate.evidence !== undefined) {
      assertEvidence(candidate.evidence);
      if (!sameEvidence(candidate.evidence, this.record.terminal.evidence)) {
        throw new ValidatorBindingError("POST_TERMINAL_UNDECLARED_EVIDENCE");
      }
    }

    this.record.resultConsumed = true;
    return {
      validation_id: this.record.terminal.validation_id,
      terminal_hash: this.record.terminal.terminal_hash,
      evidence: clone(this.record.terminal.evidence),
      consumed: true,
    };
  }

  getAck(): DispatchAck | undefined {
    return this.record.ack ? clone(this.record.ack) : undefined;
  }

  getTerminal(): Terminal | undefined {
    return this.record.terminal ? clone(this.record.terminal) : undefined;
  }
}

export function createValidatorBinding(): ValidatorBinding {
  return new ValidatorBinding();
}
