import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, canonicalSha256 } from "../src/canonical.js";
import { createEffectState, createSetRecord, reserveEffect } from "../src/effects.js";
import {
  applyValidatorDispatchAck, applyValidatorResult, applyValidatorTerminal, bindLegacyForwardValidatorTerminal,
  createValidatorDispatchAck, createValidatorTerminal, initialValidatorBindingState, parseCanonicalValidatorJson,
  serializeValidatorDispatchAck, serializeValidatorTerminal, ValidatorBindingError,
} from "../src/validator_binding.js";

const h = (value: unknown) => canonicalSha256(value);
const generation = "generation:validator-binding-01";
const turn = "019f0000-0000-7000-8000-000000000301";
const task = "host-task:validator-01";

function fixture() {
  const packetHash = h("validator-packet");
  const set = createSetRecord({
    set_id: "set:validator-binding", plan_id: "plan:validator-binding", intent_envelope_sha256: h("intent"),
    decision_id: "decision:validator-binding", bead_id: "bead:validator-binding", controller_generation: generation,
    scope: "brain:CStar/organism-v0/validator", work_packet_hashes: [packetHash], capability_profile_hash: h("profile"),
    requested_model: "gpt-5.6-luna", requested_reasoning: "max", lease: { attempt: 1 }, ceilings: { descendants: 0 },
    retry_budget: 0, terminal_schema: "corvus.terminal_packet.v1", validation_requirements: { independent: true }, protected_gates: [],
  });
  const reserved = reserveEffect({ state: createEffectState(set), cell_id: "cell:validator", payload: { operation: "validate" },
    input_manifest: [{ path: "organism-v0/src/canonical.ts", sha256: h("canonical") }], output_allowlist: [] });
  const binding = { effect: reserved.effect, set_record: set, validation_id: "validation:validator-binding",
    validation_scope_sha256: h("scope"), work_packet_sha256: packetHash, validator_profile_hash: h("validator-profile"), validator_task_id: task };
  const spawn = { task_id: task, effect_id: reserved.effect.effect_id, idempotency_key: reserved.effect.idempotency_key };
  const ack = createValidatorDispatchAck({ binding, host_spawn_receipt: spawn, dispatch_provenance_path: "receipts/spawn.json", dispatch_provenance_sha256: h("spawn") });
  const manifest = { schema: "corvus.validation-evidence-manifest.v1", entries: [
    { path: "receipts/terminal.json", sha256: h("terminal-artifact"), bytes: 17, role: "terminal" },
    { path: "receipts/check.json", sha256: h("check-artifact"), bytes: 13, role: "check" },
  ] };
  const packet = { schema: "corvus.terminal_packet.v1", status: "ACCEPTED", bead_id: set.bead_id, validation_id: binding.validation_id };
  const terminalReceipt = { task_id: task, turn_id: turn, effect_id: reserved.effect.effect_id, actual_identity: "unreported" };
  const terminalInput = { ack, binding, host_terminal_receipt: terminalReceipt, terminal_packet: packet, evidence_manifest: manifest,
    host_terminal_receipt_path: "receipts/terminal-host.json", terminal_packet_path: "receipts/terminal-packet.json",
    evidence_manifest_path: "receipts/evidence-manifest.json", verdict: "ACCEPTED" };
  return { set, reserved, binding, spawn, ack, manifest, packet, terminalReceipt, terminalInput,
    terminal: createValidatorTerminal(terminalInput) };
}

function code(action: () => unknown, expected: string) {
  assert.throws(action, (error: unknown) => error instanceof ValidatorBindingError && error.code === expected);
}

test("live two-stage binding, exact replay, and result sidecar are deterministic", () => {
  const value = fixture();
  assert.equal(value.ack.validator_turn_id_at_dispatch, "unavailable");
  assert.equal(value.ack.turn_state, "UNAVAILABLE_AT_DISPATCH");
  assert.equal(value.terminal.validator_task_id, task);
  assert.equal(value.terminal.validator_turn_id, turn);
  const acked = applyValidatorDispatchAck(initialValidatorBindingState(), value.ack);
  assert.equal(acked.replayed, false);
  assert.equal(applyValidatorDispatchAck(acked.state, value.ack).replayed, true);
  const bound = applyValidatorTerminal(acked.state, value.terminal);
  assert.equal(bound.replayed, false);
  assert.equal(applyValidatorTerminal(bound.state, value.terminal).replayed, true);
  const result = applyValidatorResult(bound.state, value.terminal);
  assert.equal(result.state.bindings[value.reserved.effect.effect_id]?.stage, "RESULT_RECORDED");
  assert.equal(applyValidatorResult(result.state, value.terminal).replayed, true);
  assert.deepEqual(parseCanonicalValidatorJson(serializeValidatorTerminal(value.terminal)), value.terminal);
});

test("closed event parsing rejects duplicate keys, alternate serialization, and non-UTF-8", () => {
  const value = fixture();
  const canonical = serializeValidatorDispatchAck(value.ack);
  assert.deepEqual(parseCanonicalValidatorJson(canonical), value.ack);
  code(() => parseCanonicalValidatorJson(canonical.replace("\n", "\n\n")), "INVALID_VALIDATOR_EVENT");
  code(() => parseCanonicalValidatorJson(new Uint8Array([0xff, 0xfe])), "INVALID_VALIDATOR_EVENT");
  code(() => parseCanonicalValidatorJson(`{"a":1,"a":1}\n`), "INVALID_VALIDATOR_EVENT");
  code(() => parseCanonicalValidatorJson(canonical.replace("{", "{ ")), "INVALID_VALIDATOR_EVENT");
});

test("typed negative guards fail closed", () => {
  const value = fixture();
  code(() => createValidatorDispatchAck({ ...value, actual_identity: "caller" } as never), "CALLER_IDENTITY_SUBSTITUTION");
  code(() => createValidatorDispatchAck({ ...value.terminalInput, verdict: "ACCEPTED" } as never), "ACK_WITH_VERDICT_OR_EVIDENCE");
  code(() => applyValidatorTerminal(initialValidatorBindingState(), value.terminal), "TERMINAL_BEFORE_ACK");
  code(() => applyValidatorTerminal(applyValidatorDispatchAck(initialValidatorBindingState(), value.ack).state,
    createValidatorTerminal({ ...value.terminalInput, host_terminal_receipt: { ...value.terminalReceipt, task_id: "host-task:other" } })), "TERMINAL_TASK_ID_MISMATCH");
  code(() => createValidatorTerminal({ ...value.terminalInput, host_terminal_receipt: { ...value.terminalReceipt, turn_id: "unavailable" } }), "TERMINAL_TURN_NULL_OR_UNAVAILABLE");
  code(() => createValidatorTerminal({ ...value.terminalInput, terminal_packet_sha256: "0".repeat(64) }), "TERMINAL_PACKET_HASH_MISMATCH");
  code(() => createValidatorTerminal({ ...value.terminalInput, evidence_manifest_sha256: "0".repeat(64) }), "MANIFEST_HASH_OR_ORDER_MISMATCH");
  const changedEvidence = { ...value.terminalInput, evidence_manifest: { ...value.manifest,
    entries: [...value.manifest.entries, { path: "receipts/late.json", sha256: h("late"), bytes: 4, role: "late" }] } };
  const sidecar = applyValidatorTerminal(applyValidatorDispatchAck(initialValidatorBindingState(), value.ack).state, value.terminal).state;
  code(() => applyValidatorTerminal(sidecar, createValidatorTerminal(changedEvidence)), "POST_TERMINAL_UNDECLARED_EVIDENCE");
  const recorded = applyValidatorResult(sidecar, value.terminal).state;
  code(() => applyValidatorResult(recorded, createValidatorTerminal({ ...value.terminalInput, verdict: "REJECTED" })), "RESULT_DUPLICATE_CONFLICT");
});

test("legacy forward binding preserves terminal-before-manifest order", () => {
  const value = fixture();
  const legacy = bindLegacyForwardValidatorTerminal(value.terminalInput);
  assert.equal(legacy.evidence_materialization_order, "TERMINAL_BEFORE_MANIFEST_BEFORE_RECORD_RESULT");
  assert.equal(legacy.evidence_manifest_sha256, value.terminal.evidence_manifest_sha256);
  code(() => createValidatorTerminal({ ...value.terminalInput, evidence_materialization_order: "TERMINAL_BEFORE_MANIFEST_BEFORE_RECORD_RESULT" }), "LEGACY_FORWARD_BIND_DOES_NOT_PRETEND_MANIFEST_PREEXISTED");
});

test("ACK and terminal hashes omit only their own content hash", () => {
  const value = fixture();
  const { ack_content_sha256, ...ackWithoutSelf } = value.ack;
  const { terminal_content_sha256, ...terminalWithoutSelf } = value.terminal;
  assert.equal(canonicalSha256(ackWithoutSelf), ack_content_sha256);
  assert.equal(canonicalSha256(terminalWithoutSelf), terminal_content_sha256);
  assert.match(canonicalJson(value.ack), /ack_content_sha256/);
  assert.match(canonicalJson(value.terminal), /terminal_content_sha256/);
});
