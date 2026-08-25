import assert from "node:assert/strict";
import test from "node:test";
import {
  ACK_WORKER_TURN,
  ValidatorBinding,
  ValidatorBindingError,
  type DispatchAckInput,
  type TerminalInput,
} from "../src/validator_binding.ts";

const ackInput: DispatchAckInput = {
  validation_id: "validation:one",
  effect_id: "effect:one",
  set_id: "set:one",
  controller_generation: 7,
  packet_file_sha256: "f4054cbf2d70be0e78dd5297acbda7f4886e12975311b582c4704a2f235185da",
  packet_content_sha256: "8f4c0a3e77737c772b01748d68dca85e5203e4b629afb0154737c5be12c674ed",
  manifest_hash: "manifest:one",
  evidence_order: ["evidence:one", "evidence:two"],
  worker_task: "/root/organism_validator_ack_terminal_binding_s1_f01",
  worker_turn: ACK_WORKER_TURN,
};

const terminalInput: TerminalInput = {
  ...ackInput,
  worker_turn: "turn:one",
  evidence: [
    { evidence_id: "evidence:one", evidence_hash: "hash:one" },
    { evidence_id: "evidence:two", evidence_hash: "hash:two" },
  ],
};

function expectCode(code: string, action: () => unknown): void {
  assert.throws(action, (error: unknown) => error instanceof ValidatorBindingError && error.code === code);
}

test("LIVE_TWO_STAGE_BINDING", () => {
  const binding = new ValidatorBinding();
  const ack = binding.bindDispatchAck(ackInput);
  assert.equal(ack.worker_turn, "unavailable");
  assert.equal("verdict" in ack, false);
  assert.equal("evidence" in ack, false);
  const terminal = binding.bindTerminal(terminalInput);
  assert.notEqual(terminal.terminal_hash, undefined);
  const result = binding.recordResult({ validation_id: ack.validation_id, terminal_hash: terminal.terminal_hash });
  assert.equal(result.consumed, true);
});

test("EXACT_ACK_REPLAY", () => {
  const binding = new ValidatorBinding();
  const first = binding.bindDispatchAck(ackInput);
  const replay = binding.bindDispatchAck({ ...ackInput, evidence_order: [...ackInput.evidence_order] });
  assert.deepEqual(replay, first);
});

test("EXACT_TERMINAL_REPLAY", () => {
  const binding = new ValidatorBinding();
  binding.bindDispatchAck(ackInput);
  const first = binding.bindTerminal(terminalInput);
  const replay = binding.bindTerminal({ ...terminalInput, evidence: [...terminalInput.evidence] });
  assert.deepEqual(replay, first);
});

test("RESULT_CONSUMES_ONCE", () => {
  const binding = new ValidatorBinding();
  binding.bindDispatchAck(ackInput);
  const terminal = binding.bindTerminal(terminalInput);
  const first = binding.recordResult({ validation_id: ackInput.validation_id, terminal_hash: terminal.terminal_hash });
  assert.equal(first.consumed, true);
  expectCode("DUPLICATE_RECORD_RESULT", () => binding.recordResult({ validation_id: ackInput.validation_id }));
});

test("ACK_TASK_ID_NOT_HOST_BOUND", () => {
  const binding = new ValidatorBinding();
  expectCode("ACK_TASK_ID_NOT_HOST_BOUND", () => binding.bindDispatchAck({ ...ackInput, worker_task: "task:foreign" }));
});

test("ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH", () => {
  const binding = new ValidatorBinding();
  expectCode("ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH", () => binding.bindDispatchAck({ ...ackInput, worker_turn: "turn:one" as typeof ACK_WORKER_TURN }));
});

test("ACK_WITH_VERDICT_OR_EVIDENCE", () => {
  const binding = new ValidatorBinding();
  expectCode("ACK_WITH_VERDICT_OR_EVIDENCE", () => binding.bindDispatchAck({ ...ackInput, verdict: "ACCEPTED" } as DispatchAckInput));
});

test("TERMINAL_BEFORE_ACK", () => {
  const binding = new ValidatorBinding();
  expectCode("TERMINAL_BEFORE_ACK", () => binding.bindTerminal(terminalInput));
});

test("TERMINAL_TASK_ID_MISMATCH", () => {
  const binding = new ValidatorBinding();
  binding.bindDispatchAck(ackInput);
  expectCode("TERMINAL_TASK_ID_MISMATCH", () => binding.bindTerminal({ ...terminalInput, worker_task: "/root/other_task" }));
});

test("TERMINAL_TURN_NULL_OR_UNAVAILABLE", () => {
  const binding = new ValidatorBinding();
  binding.bindDispatchAck(ackInput);
  expectCode("TERMINAL_TURN_NULL_OR_UNAVAILABLE", () => binding.bindTerminal({ ...terminalInput, worker_turn: "unavailable" }));
});

test("TERMINAL_VALIDATION_ID_MISMATCH", () => {
  const binding = new ValidatorBinding();
  binding.bindDispatchAck(ackInput);
  expectCode("TERMINAL_VALIDATION_ID_MISMATCH", () => binding.bindTerminal({ ...terminalInput, validation_id: "validation:other" }));
});

test("TERMINAL_EFFECT_OR_SET_MISMATCH", () => {
  const binding = new ValidatorBinding();
  binding.bindDispatchAck(ackInput);
  expectCode("TERMINAL_EFFECT_OR_SET_MISMATCH", () => binding.bindTerminal({ ...terminalInput, effect_id: "effect:other" }));
});

test("STALE_CONTROLLER_GENERATION", () => {
  const binding = new ValidatorBinding();
  binding.bindDispatchAck(ackInput);
  expectCode("STALE_CONTROLLER_GENERATION", () => binding.bindTerminal({ ...terminalInput, controller_generation: 8 }));
});

test("TERMINAL_PACKET_HASH_MISMATCH", () => {
  const binding = new ValidatorBinding();
  binding.bindDispatchAck(ackInput);
  expectCode("TERMINAL_PACKET_HASH_MISMATCH", () => binding.bindTerminal({ ...terminalInput, packet_content_sha256: "hash:other" }));
});

test("MANIFEST_HASH_OR_ORDER_MISMATCH", () => {
  const binding = new ValidatorBinding();
  binding.bindDispatchAck(ackInput);
  expectCode("MANIFEST_HASH_OR_ORDER_MISMATCH", () => binding.bindTerminal({ ...terminalInput, evidence_order: ["evidence:two", "evidence:one"] }));
});

test("POST_TERMINAL_UNDECLARED_EVIDENCE", () => {
  const binding = new ValidatorBinding();
  binding.bindDispatchAck(ackInput);
  const terminal = binding.bindTerminal(terminalInput);
  expectCode("POST_TERMINAL_UNDECLARED_EVIDENCE", () => binding.recordResult({
    validation_id: ackInput.validation_id,
    terminal_hash: terminal.terminal_hash,
    evidence: [...terminal.evidence, { evidence_id: "evidence:three", evidence_hash: "hash:three" }],
  }));
});

test("CALLER_IDENTITY_SUBSTITUTION", () => {
  const binding = new ValidatorBinding();
  binding.bindDispatchAck(ackInput);
  expectCode("CALLER_IDENTITY_SUBSTITUTION", () => binding.bindTerminal({ ...terminalInput, caller_identity: "/root/substitute" }));
});

test("ACK_IDEMPOTENCY_CONFLICT", () => {
  const binding = new ValidatorBinding();
  binding.bindDispatchAck(ackInput);
  expectCode("ACK_IDEMPOTENCY_CONFLICT", () => binding.bindDispatchAck({ ...ackInput, effect_id: "effect:other" }));
});

test("TERMINAL_IDEMPOTENCY_CONFLICT", () => {
  const binding = new ValidatorBinding();
  binding.bindDispatchAck(ackInput);
  binding.bindTerminal(terminalInput);
  expectCode("TERMINAL_IDEMPOTENCY_CONFLICT", () => binding.bindTerminal({
    ...terminalInput,
    evidence: [{ evidence_id: "evidence:one", evidence_hash: "hash:changed" }, terminalInput.evidence[1]],
  }));
});

test("LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED", () => {
  const binding = new ValidatorBinding();
  expectCode("LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED", () => binding.bindDispatchAck({
    ...ackInput,
    manifest_hash: "",
  }));
});

