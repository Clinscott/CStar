import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, canonicalSha256 } from "../src/canonical.js";
import {
  createEffectState,
  createSetRecord,
  observeInbox,
  reserveEffect,
  EffectError,
  PROJECT_CONTROLLER_DISPATCH,
} from "../src/effects.js";
import { initialState, makeReducerEvent, reduce, ReducerError } from "../src/reducer.js";
import { createWorkPacket, WorkPacketError } from "../src/work_packets.js";

const hash = (value: unknown) => canonicalSha256(value);
const scope = "brain:CStar/organism-v0/s05";
const generation = "CSO-ORGANISM-V0-S05-GENERATION-01";
const setInput = {
  set_id: "CSO-ORGANISM-V0-S05-NEGATIVE-SET-01",
  plan_id: "plan:s05:negative",
  intent_envelope_sha256: hash("intent:s05:negative"),
  decision_id: "decision:s05:negative",
  bead_id: "bead:s05:negative",
  controller_generation: generation,
  scope,
  work_packet_hashes: [hash("packet:s05:negative")],
  capability_profile_hash: hash("profile:s05:negative"),
  requested_model: "gpt-5.6-luna",
  requested_reasoning: "max",
  lease: { attempt: 1, retry_budget: 0 },
  ceilings: { descendants: 0, calls: 1, waits: 0 },
  retry_budget: 0,
  terminal_schema: "corvus.terminal_packet.v1",
  validation_requirements: { independent: true },
  protected_gates: [],
} as const;
const set = createSetRecord(setInput);
const effectInput = {
  cell_id: "cell:s05:negative",
  payload: { controller_endpoint: "project-controller://s05", operation: "negative-fixture" },
  input_manifest: [{ path: "organism-v0/src/canonical.ts", sha256: hash("canonical") }],
  output_allowlist: ["organism-v0/tests/negative_and_security.test.ts"],
};

function expectEffectCode(action: () => unknown, code: EffectError["code"]): void {
  assert.throws(action, (error: unknown) => error instanceof EffectError && error.code === code);
}

function expectReducerCode(action: () => unknown, code: ReducerError["code"]): void {
  assert.throws(action, (error: unknown) => error instanceof ReducerError && error.code === code);
}

test("unknown fields and malformed canonical inputs fail closed", () => {
  assert.throws(() => canonicalJson(undefined), /Unsupported JSON value/);
  assert.throws(() => canonicalJson(Number.NaN), /Non-finite number/);
  assert.throws(() => canonicalJson({ value: Symbol("unsupported") }), /Unsupported JSON value/);

  assert.throws(
    () => createSetRecord({ ...setInput, unknown_field: true } as never),
    (error: unknown) => error instanceof WorkPacketError && error.code === "INVALID_SET",
  );

  const packetInput = {
    packet_id: "packet:s05:negative",
    set_id: set.set_id,
    cell_id: "cell:s05:negative",
    controller_generation: generation,
    scope,
    action: "S05_NEGATIVE",
    input_manifest: effectInput.input_manifest,
    write_allowlist: ["organism-v0/tests/negative_and_security.test.ts"],
    output_allowlist: ["organism-v0/tests/negative_and_security.test.ts"],
    requested_model: set.requested_model,
    requested_reasoning: set.requested_reasoning,
    actual_identity: "unreported",
    lease: set.lease,
    ceilings: set.ceilings,
    retry_budget: 0,
    terminal_schema: "corvus.terminal_packet.v1",
    tests: ["negative_and_security"],
    protected_gates: [],
    transfer_checkpoint_ref: "CSF-D007:S04",
  };
  assert.throws(
    () => createWorkPacket({ ...packetInput, unknown_field: true } as never),
    (error: unknown) => error instanceof WorkPacketError && error.code === "INVALID_PACKET",
  );
});

test("stale controller generations and protected authority fail closed", () => {
  expectEffectCode(
    () => reserveEffect({ state: createEffectState(set), ...effectInput, controller_generation: "old-generation" }),
    "STALE_GENERATION",
  );
  expectEffectCode(
    () => reserveEffect({ state: createEffectState(set), ...effectInput, payload: { nested: { operator_grant: true } } }),
    "INVALID_EFFECT",
  );
  expectEffectCode(
    () => reserveEffect({ state: createEffectState(set), ...effectInput, payload: { nested: { lifecycle_authority: "root" } } }),
    "INVALID_EFFECT",
  );

  const state = initialState(scope, generation);
  expectReducerCode(
    () => reduce(state, makeReducerEvent({
      event_type: "INTENT_RECEIVED",
      scope,
      controller_generation: "old-generation",
      expected_revision: 0,
    })),
    "STALE_GENERATION",
  );
  expectReducerCode(
    () => reduce(state, makeReducerEvent({
      event_type: "INTENT_RECEIVED",
      scope,
      controller_generation: generation,
      expected_revision: 0,
      protected_gates: ["activation"],
    })),
    "PROTECTED_EFFECT",
  );
});

test("duplicate effects replay only identical bytes and never create a second effect", () => {
  const first = reserveEffect({ state: createEffectState(set), ...effectInput, idempotency_key: "s05-fixed-key" });
  const replay = reserveEffect({ state: first.state, ...effectInput, idempotency_key: "s05-fixed-key" });
  assert.equal(replay.replayed, true);
  assert.equal(replay.state.outbox.length, 1);
  assert.equal(replay.effect.effect_id, first.effect.effect_id);
  assert.throws(
    () => reserveEffect({
      state: first.state,
      ...effectInput,
      idempotency_key: "s05-fixed-key",
      payload: { controller_endpoint: "project-controller://s05", operation: "changed" },
    }),
    (error: unknown) => error instanceof EffectError && error.code === "IDEMPOTENCY_CONFLICT",
  );

  const accepted = observeInbox(first.state, {
    effect_id: first.effect.effect_id,
    idempotency_key: first.effect.idempotency_key,
    transport_status: "ACK",
    host_task_id: "task:s05:negative",
    host_turn_id: "turn:s05:negative",
    requested_model: set.requested_model,
    requested_reasoning: set.requested_reasoning,
    actual_identity: "unreported",
    received_at_measured: "measured:s05:negative",
    result: { terminal: true },
  });
  const inboxReplay = observeInbox(accepted.state, {
    effect_id: first.effect.effect_id,
    idempotency_key: first.effect.idempotency_key,
    transport_status: "ACK",
    host_task_id: "task:s05:negative",
    host_turn_id: "turn:s05:negative",
    requested_model: set.requested_model,
    requested_reasoning: set.requested_reasoning,
    actual_identity: "unreported",
    received_at_measured: "measured:s05:negative",
    result: { terminal: true },
  });
  assert.equal(inboxReplay.replayed, true);
  assert.equal(inboxReplay.state.inbox.length, 1);
  expectEffectCode(
    () => observeInbox(accepted.state, {
      effect_id: first.effect.effect_id,
      idempotency_key: first.effect.idempotency_key,
      transport_status: "ACK",
      requested_model: set.requested_model,
      requested_reasoning: set.requested_reasoning,
      actual_identity: "unreported",
      received_at_measured: "measured:s05:negative",
      result: { terminal: false },
    }),
    "DUPLICATE_CONFLICT",
  );
});

test("Forge actionability is not an accepted effect kind", () => {
  assert.equal(PROJECT_CONTROLLER_DISPATCH, "PROJECT_CONTROLLER_DISPATCH");
  expectEffectCode(
    () => reserveEffect({
      state: createEffectState(set),
      ...effectInput,
      effect_kind: "FORGE" as never,
      action: "FORGE",
    }),
    "INVALID_EFFECT_KIND",
  );
});
