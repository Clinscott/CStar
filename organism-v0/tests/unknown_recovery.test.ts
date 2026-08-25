import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canonicalSha256 } from "../src/canonical.js";
import {
  createEffectState,
  createSetRecord,
  observeInbox,
  reserveEffect,
  EffectError,
} from "../src/effects.js";
import { invokeNativeTaskControl } from "../src/transport.js";
import { initialState, makeReducerEvent, reduce, ReducerError } from "../src/reducer.js";
import { createWorkPacket } from "../src/work_packets.js";

const hash = (value: unknown) => canonicalSha256(value);
const scope = "brain:CStar/organism-v0/s05/unknown-recovery";
const generation = "CSO-ORGANISM-V0-S05-GENERATION-01";
const packet = createWorkPacket({
  packet_id: "packet:s05:unknown",
  set_id: "CSO-ORGANISM-V0-S05-UNKNOWN-SET-01",
  cell_id: "cell:s05:unknown",
  controller_generation: generation,
  scope,
  action: "S05_UNKNOWN_RECOVERY",
  input_manifest: [{ path: "organism-v0/src/canonical.ts", sha256: hash("canonical") }],
  write_allowlist: ["organism-v0/tests/unknown_recovery.test.ts"],
  output_allowlist: ["organism-v0/tests/unknown_recovery.test.ts"],
  requested_model: "gpt-5.6-luna",
  requested_reasoning: "max",
  actual_identity: "unreported",
  lease: { attempt: 1, wall_time_seconds: 2400 },
  ceilings: { descendants: 0, calls: 1, waits: 0 },
  retry_budget: 0,
  terminal_schema: "corvus.terminal_packet.v1",
  tests: ["unknown_recovery"],
  protected_gates: [],
  transfer_checkpoint_ref: "CSF-D007:S04",
});
const set = createSetRecord({
  set_id: packet.set_id,
  plan_id: "plan:s05:unknown",
  intent_envelope_sha256: hash("intent:s05:unknown"),
  decision_id: "decision:s05:unknown",
  bead_id: "bead:s05:unknown",
  controller_generation: generation,
  scope,
  work_packet_hashes: [packet.packet_sha256],
  capability_profile_hash: hash("profile:s05:unknown"),
  requested_model: packet.requested_model,
  requested_reasoning: packet.requested_reasoning,
  lease: packet.lease,
  ceilings: packet.ceilings,
  retry_budget: 0,
  terminal_schema: packet.terminal_schema,
  validation_requirements: { independent: true },
  protected_gates: [],
});
const payload = { controller_endpoint: "project-controller://s05", operation: "unknown-fixture" };
const inputManifest = [{ path: "organism-v0/src/canonical.ts", sha256: hash("canonical") }];
const outputAllowlist = ["organism-v0/tests/unknown_recovery.test.ts"];

function reserve(state = createEffectState(set), overrides: Record<string, unknown> = {}) {
  return reserveEffect({
    state,
    cell_id: "cell:s05:unknown",
    effect_kind: "PROJECT_CONTROLLER_DISPATCH",
    action: "PROJECT_CONTROLLER_DISPATCH",
    payload,
    input_manifest: inputManifest,
    output_allowlist: outputAllowlist,
    ...overrides,
  });
}

function expectReducerCode(action: () => unknown, code: ReducerError["code"]): void {
  assert.throws(action, (error: unknown) => error instanceof ReducerError && error.code === code);
}

test("an UNKNOWN transport result is terminal evidence with no candidate bytes", async () => {
  const reserved = reserve();
  const transport = await invokeNativeTaskControl({
    effect: reserved.effect,
    set_record: set,
    packet_sha256: packet.packet_sha256,
    packet,
    payload,
    request: { kind: "TASK_SEND", task_id: "task:s05:unknown" },
    requested_model: set.requested_model,
    requested_reasoning: set.requested_reasoning,
    executor: () => {
      throw new Error("simulated lost native response");
    },
  });
  assert.equal(transport.status, "UNKNOWN");
  assert.equal(transport.evidence.failure_code, "EXECUTOR_THROWN_OR_NO_RESPONSE");
  assert.equal(transport.evidence.native_call_count, 1);
  assert.equal(transport.evidence.result_sha256, null);
  assert.equal(transport.inbox_observation.transport_status, "UNKNOWN");
  assert.equal(Object.hasOwn(transport.inbox_observation, "result"), false);

  const unknown = observeInbox(reserved.state, transport.inbox_observation);
  assert.equal(unknown.inbox.transport_status, "UNKNOWN");
  assert.equal(unknown.inbox.result_sha256, null);
  assert.equal(unknown.state.outbox[0]?.status, "UNKNOWN");
  assert.equal(unknown.state.inbox.length, 1);

  assert.throws(
    () => observeInbox(unknown.state, {
      ...transport.inbox_observation,
      transport_status: "ACK",
      result: { candidate_bytes: "must-not-donate" },
    }),
    (error: unknown) => error instanceof EffectError && error.code === "DUPLICATE_CONFLICT",
  );
});

test("UNKNOWN recovery requires a distinct forward delta and rejects continuation", () => {
  const predecessor = reserve();
  const predecessorUnknown = observeInbox(predecessor.state, {
    effect_id: predecessor.effect.effect_id,
    idempotency_key: predecessor.effect.idempotency_key,
    transport_status: "UNKNOWN",
    received_at_measured: "measured:s05:unknown-recovery",
    failure_code: "EXECUTOR_THROWN_OR_NO_RESPONSE",
  });
  const forward = reserve(predecessorUnknown.state, {
    cell_id: "cell:s05:unknown-recovery-forward",
    payload: { controller_endpoint: "project-controller://s05", operation: "recovery-forward-delta" },
    sequence: 2,
  });
  assert.equal(forward.replayed, false);
  assert.notEqual(forward.effect.effect_id, predecessor.effect.effect_id);
  assert.equal(forward.state.outbox.length, 2);

  let state = initialState(scope, generation);
  const apply = (event_type: Parameters<typeof makeReducerEvent>[0]["event_type"], payload: unknown = {}) => {
    const result = reduce(state, makeReducerEvent({
      event_type,
      scope,
      controller_generation: generation,
      expected_revision: state.revision,
      payload,
    }));
    state = result.state;
    return result;
  };

  for (const event_type of ["INTENT_RECEIVED", "INTENT_VERIFIED", "PLAN_DERIVED", "SET_BOUND", "EFFECT_RESERVED"] as const) {
    apply(event_type);
  }
  apply("EFFECT_UNKNOWN", { effect_id: "effect:s05:unknown", candidate_bytes: 0 });
  assert.equal(state.lifecycle_state, "RECOVERY_REQUIRED");
  expectReducerCode(
    () => reduce(state, makeReducerEvent({
      event_type: "WORK_DISPATCHED",
      scope,
      controller_generation: generation,
      expected_revision: state.revision,
      payload: { candidate_bytes: "donated-by-unknown-worker" },
    })),
    "OUT_OF_ORDER",
  );

  apply("RECOVERY_SET_BOUND", {
    predecessor_effect_id: "effect:s05:unknown",
    forward_delta_id: "delta:s05:unknown-recovery:01",
  });
  assert.equal(state.lifecycle_state, "RECOVERY_SET_BOUND");
  const recovered = apply("EFFECT_RESERVED", {
    predecessor_effect_id: "effect:s05:unknown",
    forward_delta_id: "delta:s05:unknown-recovery:01",
  });
  assert.equal(recovered.replayed, false);
  assert.equal(state.lifecycle_state, "EFFECT_RESERVED");
  assert.equal(state.revision, 8);
});

test("the incident replay fixture binds zero-credit UNKNOWN evidence to the new delta", async () => {
  const fixture = JSON.parse(
    await readFile(new URL("../fixtures/incident_replay.json", import.meta.url), "utf8"),
  ) as {
    schema: string;
    predecessor: { effect_status: string; candidate_bytes: number; candidate_files: number; can_continue: boolean; can_donate_bytes: boolean; acceptance_credit: number };
    recovery: { required: boolean; state_after_unknown: string; forward_delta_id: string; distinct_from_predecessor: boolean; automatic_continuation: boolean; retry_budget: number };
    events: Array<{ event_type: string; revision: number; forward_delta_id?: string }>;
  };
  assert.equal(fixture.schema, "corvus.incident_replay.v1");
  assert.deepEqual(fixture.predecessor, {
    effect_status: "UNKNOWN",
    candidate_bytes: 0,
    candidate_files: 0,
    can_continue: false,
    can_donate_bytes: false,
    acceptance_credit: 0,
  });
  assert.equal(fixture.recovery.required, true);
  assert.equal(fixture.recovery.state_after_unknown, "RECOVERY_REQUIRED");
  assert.equal(fixture.recovery.distinct_from_predecessor, true);
  assert.equal(fixture.recovery.automatic_continuation, false);
  assert.equal(fixture.recovery.retry_budget, 0);
  assert.deepEqual(fixture.events.map(({ event_type, revision }) => ({ event_type, revision })), [
    { event_type: "EFFECT_UNKNOWN", revision: 6 },
    { event_type: "RECOVERY_SET_BOUND", revision: 7 },
    { event_type: "EFFECT_RESERVED", revision: 8 },
  ]);
});
