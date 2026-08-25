import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  BindingError,
  DISPATCH_TURN_UNAVAILABLE,
  ValidatorAckTerminalBinding,
} from "../../src/validator_binding.ts";

type AnyRecord = Record<string, any>;

const dispatchInput = (): AnyRecord => ({
  taskId: "task-01",
  hostTaskId: "task-01",
  turn: DISPATCH_TURN_UNAVAILABLE,
  effectId: "effect-01",
  setId: "set-01",
  controllerGeneration: 3,
  callerIdentity: "host-native-task-control",
  hostIdentity: "host-native-task-control",
  idempotencyKey: "ack-01",
});

const terminalInput = (ack: AnyRecord): AnyRecord => ({
  ack,
  taskId: ack.taskId,
  hostTaskId: ack.hostTaskId,
  turn: DISPATCH_TURN_UNAVAILABLE,
  validationId: "validation-01",
  effectId: ack.effectId,
  setId: ack.setId,
  controllerGeneration: ack.controllerGeneration,
  terminalPacketHash: "terminal-packet-hash-01",
  manifestHash: "manifest-hash-01",
  manifestOrder: ["organism-v0/src/validator_binding.ts"],
  evidence: { files: [], bytes: 0, tests: [] },
  callerIdentity: "host-native-task-control",
  idempotencyKey: "terminal-01",
});

const errorCode = (error: unknown): unknown =>
  error instanceof BindingError ? (error as AnyRecord).code : undefined;

const throwsCode = (fn: () => unknown, code: string): void => {
  assert.throws(fn, (error: unknown) => errorCode(error) === code);
};

const dispatch = (binding: ValidatorAckTerminalBinding): AnyRecord =>
  binding.dispatchAck(dispatchInput() as never) as AnyRecord;

test("ACK_TASK_ID_NOT_HOST_BOUND", () => {
  const input = dispatchInput();
  input.hostTaskId = "different-host-task";
  throwsCode(
    () => new ValidatorAckTerminalBinding().dispatchAck(input as never),
    "ACK_TASK_ID_NOT_HOST_BOUND",
  );
});

test("ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH", () => {
  const input = dispatchInput();
  input.turn = "turn-01";
  throwsCode(
    () => new ValidatorAckTerminalBinding().dispatchAck(input as never),
    "ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH",
  );
});

test("ACK_WITH_VERDICT_OR_EVIDENCE", () => {
  const input = dispatchInput();
  input.verdict = "ACCEPTED";
  input.evidence = { score: 1 };
  throwsCode(
    () => new ValidatorAckTerminalBinding().dispatchAck(input as never),
    "ACK_WITH_VERDICT_OR_EVIDENCE",
  );
});

test("TERMINAL_BEFORE_ACK", () => {
  const binding = new ValidatorAckTerminalBinding();
  const input = terminalInput(dispatchInput());
  throwsCode(
    () => binding.emitTerminal(input as never),
    "TERMINAL_BEFORE_ACK",
  );
});

test("TERMINAL_TASK_ID_MISMATCH", () => {
  const binding = new ValidatorAckTerminalBinding();
  const ack = dispatch(binding);
  const input = terminalInput(ack);
  input.taskId = "different-task";
  throwsCode(
    () => binding.emitTerminal(input as never),
    "TERMINAL_TASK_ID_MISMATCH",
  );
});

test("TERMINAL_TURN_NULL_OR_UNAVAILABLE", () => {
  const binding = new ValidatorAckTerminalBinding();
  const ack = dispatch(binding);
  const input = terminalInput(ack);
  input.turn = null;
  throwsCode(
    () => binding.emitTerminal(input as never),
    "TERMINAL_TURN_NULL_OR_UNAVAILABLE",
  );
});

test("TERMINAL_VALIDATION_ID_MISMATCH", () => {
  const binding = new ValidatorAckTerminalBinding();
  const ack = dispatch(binding);
  const input = terminalInput(ack);
  input.validationId = "validation-02";
  throwsCode(
    () => binding.emitTerminal(input as never),
    "TERMINAL_VALIDATION_ID_MISMATCH",
  );
});

test("TERMINAL_EFFECT_OR_SET_MISMATCH", () => {
  const binding = new ValidatorAckTerminalBinding();
  const ack = dispatch(binding);
  const input = terminalInput(ack);
  input.effectId = "effect-02";
  input.setId = "set-02";
  throwsCode(
    () => binding.emitTerminal(input as never),
    "TERMINAL_EFFECT_OR_SET_MISMATCH",
  );
});

test("STALE_CONTROLLER_GENERATION", () => {
  const binding = new ValidatorAckTerminalBinding();
  const ack = dispatch(binding);
  const input = terminalInput(ack);
  input.controllerGeneration = 2;
  throwsCode(
    () => binding.emitTerminal(input as never),
    "STALE_CONTROLLER_GENERATION",
  );
});

test("TERMINAL_PACKET_HASH_MISMATCH", () => {
  const binding = new ValidatorAckTerminalBinding();
  const ack = dispatch(binding);
  const input = terminalInput(ack);
  input.terminalPacketHash = "wrong-hash";
  throwsCode(
    () => binding.emitTerminal(input as never),
    "TERMINAL_PACKET_HASH_MISMATCH",
  );
});

test("MANIFEST_HASH_OR_ORDER_MISMATCH", () => {
  const binding = new ValidatorAckTerminalBinding();
  const ack = dispatch(binding);
  const input = terminalInput(ack);
  input.manifestHash = "wrong-manifest-hash";
  input.manifestOrder = ["unexpected-entry"];
  throwsCode(
    () => binding.emitTerminal(input as never),
    "MANIFEST_HASH_OR_ORDER_MISMATCH",
  );
});

test("POST_TERMINAL_UNDECLARED_EVIDENCE", () => {
  const binding = new ValidatorAckTerminalBinding();
  const ack = dispatch(binding);
  const input = terminalInput(ack);
  const terminal = binding.emitTerminal(input as never) as AnyRecord;
  terminal.evidence = { undeclared: true };
  throwsCode(
    () => binding.recordResult({ terminal, result: { accepted: true } } as never),
    "POST_TERMINAL_UNDECLARED_EVIDENCE",
  );
});

test("CALLER_IDENTITY_SUBSTITUTION", () => {
  const input = dispatchInput();
  input.callerIdentity = "caller-substitute";
  throwsCode(
    () => new ValidatorAckTerminalBinding().dispatchAck(input as never),
    "CALLER_IDENTITY_SUBSTITUTION",
  );
});

test("ACK_IDEMPOTENCY_CONFLICT", () => {
  const binding = new ValidatorAckTerminalBinding();
  dispatch(binding);
  const input = dispatchInput();
  input.idempotencyKey = "ack-01";
  input.effectId = "effect-02";
  throwsCode(
    () => binding.dispatchAck(input as never),
    "ACK_IDEMPOTENCY_CONFLICT",
  );
});

test("TERMINAL_IDEMPOTENCY_CONFLICT", () => {
  const binding = new ValidatorAckTerminalBinding();
  const ack = dispatch(binding);
  const input = terminalInput(ack);
  binding.emitTerminal(input as never);
  const conflict = { ...input, effectId: "effect-02" };
  throwsCode(
    () => binding.emitTerminal(conflict as never),
    "TERMINAL_IDEMPOTENCY_CONFLICT",
  );
});

test("DUPLICATE_RECORD_RESULT", () => {
  const binding = new ValidatorAckTerminalBinding();
  const ack = dispatch(binding);
  const terminal = binding.emitTerminal(terminalInput(ack) as never);
  const result = { terminal, result: { accepted: true } };
  binding.recordResult(result as never);
  throwsCode(
    () => binding.recordResult(result as never),
    "DUPLICATE_RECORD_RESULT",
  );
});

test("LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED", () => {
  throwsCode(
    () =>
      new ValidatorAckTerminalBinding().validateLegacyForwardBind({
        legacyForwardBind: true,
        manifestPreexisted: false,
      }),
    "LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED",
  );
});

test("LIVE_TWO_STAGE_BINDING", () => {
  const binding = new ValidatorAckTerminalBinding();
  const ack = dispatch(binding);
  const terminal = binding.emitTerminal(terminalInput(ack) as never);
  assert.ok(ack);
  assert.ok(terminal);
});

test("EXACT_ACK_REPLAY", () => {
  const left = dispatch(new ValidatorAckTerminalBinding());
  const right = dispatch(new ValidatorAckTerminalBinding());
  assert.deepEqual(left, right);
});

test("EXACT_TERMINAL_REPLAY", () => {
  const leftBinding = new ValidatorAckTerminalBinding();
  const rightBinding = new ValidatorAckTerminalBinding();
  const left = leftBinding.emitTerminal(terminalInput(dispatch(leftBinding)) as never);
  const right = rightBinding.emitTerminal(terminalInput(dispatch(rightBinding)) as never);
  assert.deepEqual(left, right);
});

test("RESULT_CONSUMES_ONCE", () => {
  const binding = new ValidatorAckTerminalBinding();
  const ack = dispatch(binding);
  const terminal = binding.emitTerminal(terminalInput(ack) as never);
  const first = binding.recordResult({ terminal, result: { accepted: true } } as never);
  assert.ok(first);
  throwsCode(
    () => binding.recordResult({ terminal, result: { accepted: true } } as never),
    "DUPLICATE_RECORD_RESULT",
  );
});

test("one hundred deterministic replay pairs are byte-identical", () => {
  for (let pair = 0; pair < 100; pair += 1) {
    const leftBinding = new ValidatorAckTerminalBinding();
    const rightBinding = new ValidatorAckTerminalBinding();
    const leftAck = dispatch(leftBinding);
    const rightAck = dispatch(rightBinding);
    const leftTerminal = leftBinding.emitTerminal(terminalInput(leftAck) as never);
    const rightTerminal = rightBinding.emitTerminal(terminalInput(rightAck) as never);
    assert.equal(JSON.stringify(leftAck), JSON.stringify(rightAck));
    assert.equal(JSON.stringify(leftTerminal), JSON.stringify(rightTerminal));
  }
});
