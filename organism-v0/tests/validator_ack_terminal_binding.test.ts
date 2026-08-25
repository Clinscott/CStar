import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import {
  BindingError,
  DISPATCH_TURN_UNAVAILABLE,
  type DispatchAckInput,
  type EvidenceItem,
  type ManifestBinding,
  type TerminalInput,
  ValidatorAckTerminalBinding,
} from "../src/validator_binding.ts";

const fileHash = "222291b341b5ceaa8bc4033f8e1ac21c1b8b479b77ee79f49d7736126b54329a";
const contentHash = "177bd5ea2edf40fc974f54face1a7152f68f503816e16ed9c29c6bb0eadc44f7";
const identities = {
  validationId: "validation:organism:s1:f02",
  effectId: "effect:cstar:222291b341b5ceaa8bc4033f8e1ac21c1b8b479b77ee79f49d7736126b54329a",
  setId: "CSO-ORGANISM-VALIDATOR-ACK-TERMINAL-BINDING-S1-F02-SET-01",
  controllerGeneration: 7,
  packetFileSha256: fileHash,
  packetContentSha256: contentHash,
  taskId: "/root/organism_validator_ack_terminal_binding_s1_f02",
} as const;
const evidence: readonly EvidenceItem[] = [
  { kind: "focused", receipt: "focused-pass" },
  { kind: "ast", receipt: "ast-pass" },
];

function manifest(order: readonly string[] = ["organism-v0/src/validator_binding.ts"]): ManifestBinding {
  return {
    order,
    sha256: createHash("sha256").update(JSON.stringify(order)).digest("hex"),
  };
}

function ackInput(overrides: Partial<DispatchAckInput> = {}): DispatchAckInput {
  return {
    ...identities,
    idempotencyKey: "ack:one",
    turn: DISPATCH_TURN_UNAVAILABLE,
    ...overrides,
  };
}

function terminalInput(overrides: Partial<TerminalInput> = {}): TerminalInput {
  return {
    ...identities,
    ackIdempotencyKey: "ack:one",
    idempotencyKey: "terminal:one",
    turn: "turn:concrete:1",
    callerId: "validator:independent",
    manifest: manifest(),
    evidence,
    ...overrides,
  };
}

function codeOf(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof BindingError) return error.code;
    throw error;
  }
  throw new Error("expected a typed binding failure");
}

function prepared(): ValidatorAckTerminalBinding {
  const binding = new ValidatorAckTerminalBinding();
  binding.dispatchAck(ackInput());
  return binding;
}

test("LIVE_TWO_STAGE_BINDING", () => {
  const binding = prepared();
  const terminal = binding.emitTerminal(terminalInput());
  assert.equal(terminal.kind, "terminal");
  assert.equal(terminal.ackIdempotencyKey, "ack:one");
  assert.equal(terminal.turn, "turn:concrete:1");
  assert.deepEqual(terminal.evidence, evidence);
});

test("EXACT_ACK_REPLAY", () => {
  const binding = new ValidatorAckTerminalBinding();
  const first = binding.dispatchAck(ackInput());
  const replay = binding.dispatchAck(ackInput());
  assert.deepEqual(replay, first);
  assert.equal(replay, first);
});

test("EXACT_TERMINAL_REPLAY", () => {
  const binding = prepared();
  const first = binding.emitTerminal(terminalInput());
  const replay = binding.emitTerminal(terminalInput());
  assert.deepEqual(replay, first);
  assert.equal(replay, first);
});

test("RESULT_CONSUMES_ONCE", () => {
  const binding = prepared();
  binding.emitTerminal(terminalInput());
  const result = binding.recordResult({ terminalIdempotencyKey: "terminal:one", callerId: "validator:independent", evidence });
  assert.equal(result.consumed, true);
  assert.equal(codeOf(() => binding.recordResult({ terminalIdempotencyKey: "terminal:one", callerId: "validator:independent", evidence })), "DUPLICATE_RECORD_RESULT");
});

test("one hundred deterministic replay pairs are byte-identical", () => {
  for (let index = 0; index < 100; index += 1) {
    const binding = new ValidatorAckTerminalBinding();
    const ack = binding.dispatchAck(ackInput({ idempotencyKey: `ack:${index}` }));
    assert.deepEqual(ack, binding.dispatchAck(ackInput({ idempotencyKey: `ack:${index}` })));
    const input = terminalInput({ ackIdempotencyKey: `ack:${index}`, idempotencyKey: `terminal:${index}` });
    const terminal = binding.emitTerminal(input);
    assert.deepEqual(terminal, binding.emitTerminal(input));
  }
});

test("ACK_TASK_ID_NOT_HOST_BOUND", () => {
  assert.equal(codeOf(() => new ValidatorAckTerminalBinding().dispatchAck(ackInput({ taskId: "worker-task" }))), "ACK_TASK_ID_NOT_HOST_BOUND");
});

test("ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH", () => {
  assert.equal(codeOf(() => new ValidatorAckTerminalBinding().dispatchAck(ackInput({ turn: "turn:one" }))), "ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH");
});

test("ACK_WITH_VERDICT_OR_EVIDENCE", () => {
  assert.equal(codeOf(() => new ValidatorAckTerminalBinding().dispatchAck(ackInput({ evidence }))), "ACK_WITH_VERDICT_OR_EVIDENCE");
});

test("TERMINAL_BEFORE_ACK", () => {
  assert.equal(codeOf(() => new ValidatorAckTerminalBinding().emitTerminal(terminalInput())), "TERMINAL_BEFORE_ACK");
});

test("TERMINAL_TASK_ID_MISMATCH", () => {
  assert.equal(codeOf(() => prepared().emitTerminal(terminalInput({ taskId: "/root/other-worker" }))), "TERMINAL_TASK_ID_MISMATCH");
});

test("TERMINAL_TURN_NULL_OR_UNAVAILABLE", () => {
  assert.equal(codeOf(() => prepared().emitTerminal(terminalInput({ turn: DISPATCH_TURN_UNAVAILABLE }))), "TERMINAL_TURN_NULL_OR_UNAVAILABLE");
});

test("TERMINAL_VALIDATION_ID_MISMATCH", () => {
  assert.equal(codeOf(() => prepared().emitTerminal(terminalInput({ validationId: "validation:other" }))), "TERMINAL_VALIDATION_ID_MISMATCH");
});

test("TERMINAL_EFFECT_OR_SET_MISMATCH", () => {
  assert.equal(codeOf(() => prepared().emitTerminal(terminalInput({ setId: "set:other" }))), "TERMINAL_EFFECT_OR_SET_MISMATCH");
});

test("STALE_CONTROLLER_GENERATION", () => {
  assert.equal(codeOf(() => prepared().emitTerminal(terminalInput({ controllerGeneration: 6 }))), "STALE_CONTROLLER_GENERATION");
});

test("TERMINAL_PACKET_HASH_MISMATCH", () => {
  assert.equal(codeOf(() => prepared().emitTerminal(terminalInput({ packetContentSha256: "a".repeat(64) }))), "TERMINAL_PACKET_HASH_MISMATCH");
});

test("MANIFEST_HASH_OR_ORDER_MISMATCH", () => {
  assert.equal(codeOf(() => prepared().emitTerminal(terminalInput({ manifest: { order: ["wrong"], sha256: "a".repeat(64) } }))), "MANIFEST_HASH_OR_ORDER_MISMATCH");
});

test("POST_TERMINAL_UNDECLARED_EVIDENCE", () => {
  const binding = prepared();
  binding.emitTerminal(terminalInput());
  assert.equal(codeOf(() => binding.recordResult({ terminalIdempotencyKey: "terminal:one", callerId: "validator:independent", evidence: [{ kind: "extra" }] })), "POST_TERMINAL_UNDECLARED_EVIDENCE");
});

test("CALLER_IDENTITY_SUBSTITUTION", () => {
  const binding = prepared();
  binding.emitTerminal(terminalInput());
  assert.equal(codeOf(() => binding.recordResult({ terminalIdempotencyKey: "terminal:one", callerId: "validator:substitute", evidence })), "CALLER_IDENTITY_SUBSTITUTION");
});

test("ACK_IDEMPOTENCY_CONFLICT", () => {
  const binding = new ValidatorAckTerminalBinding();
  binding.dispatchAck(ackInput());
  assert.equal(codeOf(() => binding.dispatchAck(ackInput({ effectId: "effect:other" }))), "ACK_IDEMPOTENCY_CONFLICT");
});

test("TERMINAL_IDEMPOTENCY_CONFLICT", () => {
  const binding = prepared();
  binding.emitTerminal(terminalInput());
  assert.equal(codeOf(() => binding.emitTerminal(terminalInput({ turn: "turn:other" }))), "TERMINAL_IDEMPOTENCY_CONFLICT");
});

test("DUPLICATE_RECORD_RESULT", () => {
  const binding = prepared();
  binding.emitTerminal(terminalInput());
  const input = { terminalIdempotencyKey: "terminal:one", callerId: "validator:independent", evidence };
  binding.recordResult(input);
  assert.equal(codeOf(() => binding.recordResult(input)), "DUPLICATE_RECORD_RESULT");
});

test("LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED", () => {
  assert.equal(codeOf(() => new ValidatorAckTerminalBinding().validateLegacyForwardBind({ legacyForwardBind: true, manifestPreexisted: true })), "LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED");
});
