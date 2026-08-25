import assert from "node:assert/strict";
import test from "node:test";
import { canonicalSha256 } from "../src/canonical.js";
import {
  createValidatorAck,
  createValidatorState,
  createValidatorTerminal,
  recordValidatorAck,
  recordValidatorResult,
  recordValidatorTerminal,
  ValidatorBindingError,
} from "../src/validator_binding.js";

const packet_file_sha256 = "1".repeat(64);
const packet_content_sha256 = "2".repeat(64);
const generation = "generation:s1";
const base = {
  validation_id: "validation:s1",
  set_id: "set:s1",
  effect_id: "effect:s1",
  controller_generation: generation,
  packet_file_sha256,
  packet_content_sha256,
  worker_task: "/root/organism_validator_ack_terminal_binding_s1",
};
const manifest = [{ path: "organism-v0/src/validator_binding.ts", sha256: "3".repeat(64) }];
const evidence = { verdict_basis: "independent", checks: ["ack", "terminal"] };

function code(action: () => unknown, expected: string) {
  assert.throws(action, (error: unknown) => error instanceof ValidatorBindingError && error.code === expected);
}

function ack(overrides: Record<string, unknown> = {}) {
  return createValidatorAck({ ...base, ...overrides } as any);
}

function terminal(overrides: Record<string, unknown> = {}) {
  return createValidatorTerminal({
    ...base,
    worker_turn: "turn:concrete-1",
    verdict: "ACCEPTED",
    manifest,
    manifest_sha256: canonicalSha256(manifest),
    evidence,
    evidence_sha256: canonicalSha256(evidence),
    ...overrides,
  } as any);
}

function bound() {
  const first = recordValidatorAck(createValidatorState({ controller_generation: generation }), ack());
  return { ...first, terminal: recordValidatorTerminal(first.state, terminal()) };
}

test("LIVE_TWO_STAGE_BINDING", () => {
  const result = bound();
  assert.equal(result.replayed, false);
  assert.equal(result.terminal.replayed, false);
  assert.equal(result.terminal.terminal.worker_turn, "turn:concrete-1");
});

test("EXACT_ACK_REPLAY", () => {
  const state = createValidatorState({ controller_generation: generation });
  const first = recordValidatorAck(state, ack());
  const replay = recordValidatorAck(first.state, ack());
  assert.equal(replay.replayed, true);
  assert.equal(replay.state.revision, 1);
});

test("EXACT_TERMINAL_REPLAY", () => {
  const first = bound();
  const replay = recordValidatorTerminal(first.terminal.state, terminal());
  assert.equal(replay.replayed, true);
  assert.equal(replay.state.revision, 2);
});

test("ACCEPTED_LEGACY_FORWARD_BIND", () => {
  const legacyAck = ack({ legacy_forward_bind: true });
  const state = recordValidatorAck(createValidatorState({ controller_generation: generation }), legacyAck).state;
  const accepted = recordValidatorTerminal(state, terminal({ legacy_forward_bind: true, manifest_preexisted: false }));
  assert.equal(accepted.terminal.verdict, "ACCEPTED");
  assert.equal(accepted.terminal.manifest_preexisted, false);
});

test("ACK_TASK_ID_NOT_HOST_BOUND", () => code(() => ack({ host_task_id: "other-host-task" }), "ACK_TASK_ID_NOT_HOST_BOUND"));
test("ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH", () => code(() => ack({ worker_turn: "turn:too-early" }), "ACK_TURN_NOT_UNAVAILABLE_AT_DISPATCH"));
test("ACK_WITH_VERDICT_OR_EVIDENCE", () => code(() => ack({ verdict: "ACCEPTED" }), "ACK_WITH_VERDICT_OR_EVIDENCE"));
test("TERMINAL_BEFORE_ACK", () => code(() => recordValidatorTerminal(createValidatorState({ controller_generation: generation }), terminal()), "TERMINAL_BEFORE_ACK"));
test("TERMINAL_TASK_ID_MISMATCH", () => {
  const first = recordValidatorAck(createValidatorState({ controller_generation: generation }), ack());
  code(() => recordValidatorTerminal(first.state, terminal({ worker_task: "/root/other" })), "TERMINAL_TASK_ID_MISMATCH");
});
test("TERMINAL_TURN_NULL_OR_UNAVAILABLE", () => code(() => terminal({ worker_turn: "unavailable" }), "TERMINAL_TURN_NULL_OR_UNAVAILABLE"));
test("TERMINAL_VALIDATION_ID_MISMATCH", () => {
  const first = recordValidatorAck(createValidatorState({ controller_generation: generation }), ack());
  code(() => recordValidatorTerminal(first.state, terminal({ validation_id: "validation:other" })), "TERMINAL_BEFORE_ACK");
});
test("TERMINAL_EFFECT_OR_SET_MISMATCH", () => {
  const first = recordValidatorAck(createValidatorState({ controller_generation: generation }), ack());
  code(() => recordValidatorTerminal(first.state, terminal({ effect_id: "effect:other" })), "TERMINAL_EFFECT_OR_SET_MISMATCH");
});
test("STALE_CONTROLLER_GENERATION", () => {
  const stale = ack({ controller_generation: "generation:old" });
  code(() => recordValidatorAck(createValidatorState({ controller_generation: generation }), stale), "STALE_CONTROLLER_GENERATION");
});
test("TERMINAL_PACKET_HASH_MISMATCH", () => {
  const first = recordValidatorAck(createValidatorState({ controller_generation: generation }), ack());
  code(() => recordValidatorTerminal(first.state, terminal({ packet_content_sha256: "4".repeat(64) })), "TERMINAL_PACKET_HASH_MISMATCH");
});
test("MANIFEST_HASH_OR_ORDER_MISMATCH", () => {
  const first = recordValidatorAck(createValidatorState({ controller_generation: generation }), ack());
  code(() => recordValidatorTerminal(first.state, terminal({ manifest: [...manifest].reverse(), manifest_sha256: canonicalSha256(manifest) })), "MANIFEST_HASH_OR_ORDER_MISMATCH");
});
test("POST_TERMINAL_UNDECLARED_EVIDENCE", () => {
  const first = bound();
  code(() => recordValidatorResult(first.terminal.state, first.terminal.terminal, { extra: true }), "POST_TERMINAL_UNDECLARED_EVIDENCE");
});
test("CALLER_IDENTITY_SUBSTITUTION", () => code(() => ack({ caller_identity: "substituted" }), "CALLER_IDENTITY_SUBSTITUTION"));
test("ACK_IDEMPOTENCY_CONFLICT", () => {
  const first = recordValidatorAck(createValidatorState({ controller_generation: generation }), ack({ idempotency_key: "ack:key" }));
  code(() => recordValidatorAck(first.state, ack({ idempotency_key: "ack:key", worker_task: "/root/other" })), "ACK_TASK_ID_NOT_HOST_BOUND");
});
test("TERMINAL_IDEMPOTENCY_CONFLICT", () => {
  const first = bound();
  code(() => recordValidatorTerminal(first.terminal.state, terminal({ idempotency_key: first.terminal.terminal.idempotency_key, worker_turn: "turn:other" })), "TERMINAL_IDEMPOTENCY_CONFLICT");
});
test("DUPLICATE_RECORD_RESULT", () => {
  const first = bound();
  const recorded = recordValidatorResult(first.terminal.state, first.terminal.terminal);
  code(() => recordValidatorResult(recorded.state, first.terminal.terminal), "DUPLICATE_RECORD_RESULT");
});
test("LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED", () => code(() => terminal({ legacy_forward_bind: true, manifest_preexisted: true, manifest: undefined }), "LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED"));

test("terminal hashes are immutable and ordered", () => {
  const value = terminal();
  assert.equal(value.manifest_sha256, canonicalSha256(manifest));
  assert.equal(value.evidence_sha256, canonicalSha256(evidence));
  assert.equal(value.terminal_sha256, canonicalSha256({ ...value, terminal_sha256: undefined }));
});

test("one hundred deterministic replay pairs are byte-identical", () => {
  for (let index = 0; index < 100; index += 1) {
    const left = bound();
    const right = bound();
    assert.equal(canonicalSha256(left.state), canonicalSha256(right.state));
    assert.equal(left.terminal.terminal.terminal_sha256, right.terminal.terminal.terminal_sha256);
  }
});
