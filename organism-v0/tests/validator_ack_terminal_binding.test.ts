import assert from "node:assert/strict";
import test from "node:test";
import { canonicalSha256 } from "../src/canonical.js";
import {
  BindingError,
  DISPATCH_TURN_UNAVAILABLE,
  ValidatorAckTerminalBinding,
} from "../src/validator_binding.js";

const hash = (value: unknown) => canonicalSha256(value);
const ids = {
  validationId: "validation:s1-f03",
  effectId: "effect:cstar:s1-f03",
  setId: "set:s1-f03",
  packetFileSha256: hash("packet-file"),
  packetContentSha256: hash("packet-content"),
  taskId: "task:host-bound",
  controllerGeneration: 7,
} as const;
const manifest = [{ path: "evidence/terminal.json", sha256: hash("terminal"), bytes: 8, role: "evidence" }] as const;
const evidence = Object.freeze({ accepted: true, score: 1 });

function ackInput(extra: Record<string, unknown> = {}) {
  return { ...ids, hostTaskId: ids.taskId, ...extra };
}
function terminalInput(binding: ValidatorAckTerminalBinding, extra: Record<string, unknown> = {}) {
  const ack = binding.dispatchAck(ackInput());
  return { ack, turn: "turn:terminal:1", manifest, evidence, terminalPacketSha256: hash("terminal-packet"), ...extra };
}
function code(action: () => unknown, expected: BindingError["code"]) {
  assert.throws(action, (error: unknown) => error instanceof BindingError && error.code === expected);
}

test("LIVE_TWO_STAGE_BINDING", () => {
  const binding = new ValidatorAckTerminalBinding();
  const ack = binding.dispatchAck(ackInput());
  const terminal = binding.emitTerminal(terminalInput(binding));
  const result = binding.recordResult({ terminal, callerIdentity: { taskId: terminal.taskId, turn: terminal.turn }, evidence });
  assert.equal(ack.turn, DISPATCH_TURN_UNAVAILABLE);
  assert.equal(terminal.ackContentSha256, ack.ackContentSha256);
  assert.equal(result.consumed, true);
});

test("EXACT_ACK_REPLAY", () => {
  const binding = new ValidatorAckTerminalBinding();
  const first = binding.dispatchAck(ackInput());
  const second = binding.dispatchAck(ackInput({ idempotencyKey: first.idempotencyKey }));
  assert.deepEqual(second, first);
});

test("EXACT_TERMINAL_REPLAY", () => {
  const binding = new ValidatorAckTerminalBinding();
  const first = binding.emitTerminal(terminalInput(binding));
  const second = binding.emitTerminal({ ...terminalInput(binding), idempotencyKey: first.idempotencyKey });
  assert.deepEqual(second, first);
});

test("RESULT_CONSUMES_ONCE", () => {
  const binding = new ValidatorAckTerminalBinding();
  const terminal = binding.emitTerminal(terminalInput(binding));
  const input = { terminal, callerIdentity: { taskId: terminal.taskId, turn: terminal.turn }, evidence };
  const first = binding.recordResult(input);
  assert.deepEqual(binding.recordResult(input), first);
});

test("one hundred deterministic replay pairs are byte-identical", () => {
  for (let pair = 0; pair < 100; pair += 1) {
    const left = new ValidatorAckTerminalBinding().dispatchAck(ackInput());
    const right = new ValidatorAckTerminalBinding().dispatchAck(ackInput());
    assert.equal(canonicalSha256(left), canonicalSha256(right));
  }
});

test("ACK_TASK_ID_NOT_HOST_BOUND", () => code(() => new ValidatorAckTerminalBinding().dispatchAck({ ...ids }), "ACK_TASK_ID_NOT_HOST_BOUND"));
test("ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH", () => code(() => new ValidatorAckTerminalBinding().dispatchAck(ackInput({ turn: "turn:wrong" })), "ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH"));
test("ACK_WITH_VERDICT_OR_EVIDENCE", () => code(() => new ValidatorAckTerminalBinding().dispatchAck(ackInput({ evidence: { forged: true } })), "ACK_WITH_VERDICT_OR_EVIDENCE"));
test("TERMINAL_BEFORE_ACK", () => code(() => new ValidatorAckTerminalBinding().emitTerminal({ ack: undefined, turn: "turn:terminal", manifest, evidence }), "TERMINAL_BEFORE_ACK"));
test("TERMINAL_TASK_ID_MISMATCH", () => { const b = new ValidatorAckTerminalBinding(); code(() => b.emitTerminal(terminalInput(b, { taskId: "task:other" })), "TERMINAL_TASK_ID_MISMATCH"); });
test("TERMINAL_TURN_NULL_OR_UNAVAILABLE", () => { const b = new ValidatorAckTerminalBinding(); code(() => b.emitTerminal(terminalInput(b, { turn: DISPATCH_TURN_UNAVAILABLE })), "TERMINAL_TURN_NULL_OR_UNAVAILABLE"); });
test("TERMINAL_VALIDATION_ID_MISMATCH", () => { const b = new ValidatorAckTerminalBinding(); code(() => b.emitTerminal(terminalInput(b, { validationId: "validation:other" })), "TERMINAL_VALIDATION_ID_MISMATCH"); });
test("TERMINAL_EFFECT_OR_SET_MISMATCH", () => { const b = new ValidatorAckTerminalBinding(); code(() => b.emitTerminal(terminalInput(b, { effectId: "effect:other" })), "TERMINAL_EFFECT_OR_SET_MISMATCH"); });
test("STALE_CONTROLLER_GENERATION", () => { const b = new ValidatorAckTerminalBinding(); code(() => b.emitTerminal(terminalInput(b, { controllerGeneration: 6 })), "STALE_CONTROLLER_GENERATION"); });
test("TERMINAL_PACKET_HASH_MISMATCH", () => { const b = new ValidatorAckTerminalBinding(); code(() => b.emitTerminal(terminalInput(b, { packetContentSha256: hash("other") })), "TERMINAL_PACKET_HASH_MISMATCH"); });
test("MANIFEST_HASH_OR_ORDER_MISMATCH", () => { const b = new ValidatorAckTerminalBinding(); code(() => b.emitTerminal(terminalInput(b, { manifestSha256: hash("wrong") })), "MANIFEST_HASH_OR_ORDER_MISMATCH"); });
test("POST_TERMINAL_UNDECLARED_EVIDENCE", () => { const b = new ValidatorAckTerminalBinding(); const t = b.emitTerminal(terminalInput(b)); code(() => b.recordResult({ terminal: t, callerIdentity: { taskId: t.taskId, turn: t.turn }, evidence: { changed: true } }), "POST_TERMINAL_UNDECLARED_EVIDENCE"); });
test("CALLER_IDENTITY_SUBSTITUTION", () => { const b = new ValidatorAckTerminalBinding(); const t = b.emitTerminal(terminalInput(b)); code(() => b.recordResult({ terminal: t, callerIdentity: { taskId: "task:substituted", turn: t.turn }, evidence }), "CALLER_IDENTITY_SUBSTITUTION"); });
test("ACK_IDEMPOTENCY_CONFLICT", () => { const b = new ValidatorAckTerminalBinding(); const a = b.dispatchAck(ackInput()); code(() => b.dispatchAck(ackInput({ idempotencyKey: a.idempotencyKey, packetContentSha256: hash("changed") })), "ACK_IDEMPOTENCY_CONFLICT"); });
test("TERMINAL_IDEMPOTENCY_CONFLICT", () => { const b = new ValidatorAckTerminalBinding(); const t = b.emitTerminal(terminalInput(b)); code(() => b.emitTerminal(terminalInput(b, { idempotencyKey: t.idempotencyKey, evidence: { changed: true } })), "TERMINAL_IDEMPOTENCY_CONFLICT"); });
test("DUPLICATE_RECORD_RESULT", () => { const b = new ValidatorAckTerminalBinding(); const t = b.emitTerminal(terminalInput(b)); const input = { terminal: t, callerIdentity: { taskId: t.taskId, turn: t.turn }, evidence }; b.recordResult(input); code(() => b.recordResult({ ...input, verdict: "changed" }), "RESULT_DUPLICATE_CONFLICT"); });
test("LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED", () => { const b = new ValidatorAckTerminalBinding(); code(() => b.validateLegacyForwardBind({ legacyForwardBind: true, manifestPreexisted: true }), "LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED"); });

