import { describe, expect, it } from "vitest";
import {
  DISPATCH_TURN_UNAVAILABLE,
  ValidatorAckTerminalBinding,
} from "../../src/validator_binding";

type Input = Record<string, unknown>;
type Binding = InstanceType<typeof ValidatorAckTerminalBinding>;
type Fixture = { binding: Binding; ack: Input; terminal: Input; result: Input };

const makeFixture = (): Fixture => {
  const common: Input = {
    taskId: "host-task-1",
    hostTaskId: "host-task-1",
    effectId: "effect-1",
    setId: "set-1",
    controllerGeneration: 7,
    callerIdentity: "validator-1",
    validationId: "validation-1",
    manifestHash: "manifest-1",
    manifestOrder: ["entry-a", "entry-b"],
  };
  return {
    binding: new ValidatorAckTerminalBinding(),
    ack: { ...common, turn: DISPATCH_TURN_UNAVAILABLE, idempotencyKey: "ack-1" },
    terminal: {
      ...common,
      turn: "terminal-turn-1",
      packetHash: "packet-1",
      terminalPacketHash: "packet-1",
      idempotencyKey: "terminal-1",
      declaredEvidence: ["evidence-1"],
      evidence: [{ id: "evidence-1", hash: "evidence-hash-1" }],
      verdict: "accepted",
    },
    result: {
      ...common,
      turn: "terminal-turn-1",
      packetHash: "packet-1",
      terminalPacketHash: "packet-1",
      idempotencyKey: "result-1",
      evidence: [{ id: "evidence-1", hash: "evidence-hash-1" }],
      verdict: "accepted",
    },
  };
};

const dispatch = (f: Fixture): unknown => f.binding.dispatchAck(f.ack as never);
const emit = (f: Fixture): unknown => f.binding.emitTerminal(f.terminal as never);
const ackThen = (f: Fixture): void => {
  dispatch(f);
};
const ackAndTerminal = (f: Fixture): unknown => {
  ackThen(f);
  return emit(f);
};
const record = (f: Fixture, packet: unknown): unknown =>
  f.binding.recordResult({ ...f.result, terminalPacket: packet, terminal: packet } as never);

const positiveRows = [
  {
    name: "LIVE_TWO_STAGE_BINDING",
    run: (f: Fixture) => record(f, ackAndTerminal(f)),
  },
  {
    name: "EXACT_ACK_REPLAY",
    run: (f: Fixture) => {
      const first = dispatch(f);
      const second = dispatch(f);
      expect(second).toStrictEqual(first);
      return second;
    },
  },
  {
    name: "EXACT_TERMINAL_REPLAY",
    run: (f: Fixture) => {
      ackThen(f);
      const first = emit(f);
      const second = emit(f);
      expect(second).toStrictEqual(first);
      return second;
    },
  },
  {
    name: "RESULT_CONSUMES_ONCE",
    run: (f: Fixture) => record(f, ackAndTerminal(f)),
  },
] as const;

describe("validator ACK and terminal binding", () => {
  it.each(positiveRows)("$name", ({ run }) => {
    expect(run(makeFixture())).toBeDefined();
  });

  const negativeRows = [
    ["ACK_TASK_ID_NOT_HOST_BOUND", (f: Fixture) => f.binding.dispatchAck({ ...f.ack, taskId: "claimed-task" } as never)],
    ["ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH", (f: Fixture) => f.binding.dispatchAck({ ...f.ack, turn: "turn-1" } as never)],
    ["ACK_WITH_VERDICT_OR_EVIDENCE", (f: Fixture) => f.binding.dispatchAck({ ...f.ack, verdict: "accepted", evidence: [] } as never)],
    ["TERMINAL_BEFORE_ACK", (f: Fixture) => emit(f)],
    ["TERMINAL_TASK_ID_MISMATCH", (f: Fixture) => { ackThen(f); return f.binding.emitTerminal({ ...f.terminal, taskId: "other-task" } as never); }],
    ["TERMINAL_TURN_NULL_OR_UNAVAILABLE", (f: Fixture) => { ackThen(f); return f.binding.emitTerminal({ ...f.terminal, turn: null } as never); }],
    ["TERMINAL_VALIDATION_ID_MISMATCH", (f: Fixture) => { ackThen(f); return f.binding.emitTerminal({ ...f.terminal, validationId: "other-validation" } as never); }],
    ["TERMINAL_EFFECT_OR_SET_MISMATCH", (f: Fixture) => { ackThen(f); return f.binding.emitTerminal({ ...f.terminal, effectId: "effect-2", setId: "set-2" } as never); }],
    ["STALE_CONTROLLER_GENERATION", (f: Fixture) => { ackThen(f); return f.binding.emitTerminal({ ...f.terminal, controllerGeneration: 6 } as never); }],
    ["TERMINAL_PACKET_HASH_MISMATCH", (f: Fixture) => { ackThen(f); return f.binding.emitTerminal({ ...f.terminal, packetHash: "packet-2", terminalPacketHash: "packet-2" } as never); }],
    ["MANIFEST_HASH_OR_ORDER_MISMATCH", (f: Fixture) => { ackThen(f); return f.binding.emitTerminal({ ...f.terminal, manifestHash: "manifest-2", manifestOrder: ["entry-b", "entry-a"] } as never); }],
    ["POST_TERMINAL_UNDECLARED_EVIDENCE", (f: Fixture) => { const packet = ackAndTerminal(f); return record({ ...f, result: { ...f.result, evidence: [{ id: "undeclared", hash: "other" }] } }, packet); }],
    ["CALLER_IDENTITY_SUBSTITUTION", (f: Fixture) => { ackThen(f); return f.binding.emitTerminal({ ...f.terminal, callerIdentity: "operator-1" } as never); }],
    ["ACK_IDEMPOTENCY_CONFLICT", (f: Fixture) => { dispatch(f); return f.binding.dispatchAck({ ...f.ack, taskId: "host-task-2" } as never); }],
    ["TERMINAL_IDEMPOTENCY_CONFLICT", (f: Fixture) => { ackThen(f); emit(f); return f.binding.emitTerminal({ ...f.terminal, validationId: "validation-2" } as never); }],
    ["DUPLICATE_RECORD_RESULT", (f: Fixture) => { const packet = ackAndTerminal(f); record(f, packet); return record(f, packet); }],
    ["LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED", (f: Fixture) => f.binding.validateLegacyForwardBind({ legacyForwardBind: true, manifestPreexisted: false })],
  ] as const;

  it.each(negativeRows)("%s", (name, run) => {
    let thrown: unknown;
    try {
      run(makeFixture());
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { code?: unknown } | undefined)?.code).toBe(name);
  });

  it("one hundred deterministic replay pairs are byte-identical", () => {
    for (let index = 0; index < 100; index += 1) {
      const left = makeFixture();
      const right = makeFixture();
      expect(JSON.stringify(dispatch(left))).toBe(JSON.stringify(dispatch(right)));
      expect(JSON.stringify(ackAndTerminal(left))).toBe(JSON.stringify(ackAndTerminal(right)));
    }
  });
});
