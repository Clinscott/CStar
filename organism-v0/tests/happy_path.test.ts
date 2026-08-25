import assert from "node:assert/strict";
import test from "node:test";
import { canonicalSha256 } from "../src/canonical.js";
import {
  createEffectState,
  createSetRecord,
  observeInbox,
  PROJECT_CONTROLLER_DISPATCH,
  reserveEffect,
} from "../src/effects.js";
import { initialState, makeReducerEvent, reduce } from "../src/reducer.js";
import { invokeNativeTaskControl, verifyTransportEvidence } from "../src/transport.js";
import { createWorkPacket } from "../src/work_packets.js";

const hash = (value: unknown) => canonicalSha256(value);
const scope = "brain:CStar/organism-v0/s05/happy-path";
const generation = "CSO-ORGANISM-V0-S05-GENERATION-01";
const packet = createWorkPacket({
  packet_id: "packet:s05:happy",
  set_id: "CSO-ORGANISM-V0-S05-HAPPY-SET-01",
  cell_id: "cell:s05:happy",
  controller_generation: generation,
  scope,
  action: "S05_DIRECT_PROJECT_CONTROLLER",
  input_manifest: [{ path: "organism-v0/src/canonical.ts", sha256: hash("canonical") }],
  write_allowlist: ["organism-v0/tests/happy_path.test.ts"],
  output_allowlist: ["organism-v0/tests/happy_path.test.ts"],
  requested_model: "gpt-5.6-luna",
  requested_reasoning: "max",
  actual_identity: "unreported",
  lease: { attempt: 1, wall_time_seconds: 2400 },
  ceilings: { descendants: 0, calls: 1, waits: 0 },
  retry_budget: 0,
  terminal_schema: "corvus.terminal_packet.v1",
  tests: ["happy_path"],
  protected_gates: [],
  transfer_checkpoint_ref: "CSF-D007:S04",
});
const set = createSetRecord({
  set_id: packet.set_id,
  plan_id: "plan:s05:happy",
  intent_envelope_sha256: hash("intent:s05:happy"),
  decision_id: "decision:s05:happy",
  bead_id: "bead:s05:happy",
  controller_generation: generation,
  scope,
  work_packet_hashes: [packet.packet_sha256],
  capability_profile_hash: hash("profile:s05:happy"),
  requested_model: packet.requested_model,
  requested_reasoning: packet.requested_reasoning,
  lease: packet.lease,
  ceilings: packet.ceilings,
  retry_budget: 0,
  terminal_schema: packet.terminal_schema,
  validation_requirements: { independent: true },
  protected_gates: [],
});
const payload = {
  controller_endpoint: "project-controller://organism-v0/s05",
  operation: "run-independent-fixture",
};

test("direct project-controller happy path has one reservation, dispatch, ACK, terminal, and independent result", async () => {
  const reserved = reserveEffect({
    state: createEffectState(set),
    cell_id: packet.cell_id,
    effect_kind: PROJECT_CONTROLLER_DISPATCH,
    action: PROJECT_CONTROLLER_DISPATCH,
    payload,
    input_manifest: packet.input_manifest,
    output_allowlist: packet.output_allowlist,
  });
  assert.equal(reserved.replayed, false);
  assert.equal(reserved.state.outbox.length, 1);
  assert.equal(reserved.effect.status, "RESERVED");

  let executorCalls = 0;
  const dispatch = await invokeNativeTaskControl({
    effect: reserved.effect,
    set_record: set,
    packet_sha256: packet.packet_sha256,
    packet,
    payload,
    request: { kind: "TASK_SEND", task_id: "task:s05:project-controller" },
    requested_model: set.requested_model,
    requested_reasoning: set.requested_reasoning,
    executor: (request) => {
      executorCalls += 1;
      assert.equal(request.kind, "TASK_SEND");
      return {
        status: "ACK",
        terminal: true,
        result: {
          status: "DELIVERED_UNVERIFIED",
          output_manifest: [],
          tests_passed: 4,
        },
      };
    },
  });
  assert.equal(executorCalls, 1);
  assert.equal(dispatch.status, "ACK");
  assert.equal(dispatch.evidence.native_call_count, 1);
  assert.equal(dispatch.evidence.retry_count, 0);
  assert.equal(dispatch.evidence.replay_count, 0);
  assert.equal(dispatch.evidence.authority_granted, false);
  assert.equal(dispatch.evidence.lifecycle_mutated, false);
  assert.equal(verifyTransportEvidence(dispatch.evidence), true);

  const observed = observeInbox(reserved.state, dispatch.inbox_observation);
  assert.equal(observed.replayed, false);
  assert.equal(observed.state.outbox.length, 1);
  assert.equal(observed.state.outbox[0]?.status, "ACKED");
  assert.equal(observed.state.inbox.length, 1);
  assert.equal(observed.inbox.transport_status, "ACK");
  assert.equal(observed.inbox.actual_identity, "unreported");

  let lifecycle = initialState(scope, generation);
  const events: Array<{ event_type: string; payload: unknown }> = [];
  const apply = (event_type: Parameters<typeof makeReducerEvent>[0]["event_type"], eventPayload: unknown = {}) => {
    const result = reduce(lifecycle, makeReducerEvent({
      event_type,
      scope,
      controller_generation: generation,
      expected_revision: lifecycle.revision,
      payload: eventPayload,
    }));
    lifecycle = result.state;
    events.push({ event_type, payload: eventPayload });
    return result;
  };

  for (const event_type of ["INTENT_RECEIVED", "INTENT_VERIFIED", "PLAN_DERIVED", "SET_BOUND"] as const) {
    apply(event_type);
  }
  apply("EFFECT_RESERVED", { effect_id: reserved.effect.effect_id });
  apply("EFFECT_ACKED", { effect_id: reserved.effect.effect_id, transport_status: dispatch.status });
  apply("WORK_DISPATCHED", { effect_id: reserved.effect.effect_id, endpoint: payload.controller_endpoint });

  const terminalPacket = {
    schema: "corvus.terminal_packet.v1",
    packet_sha256: packet.packet_sha256,
    set_id: set.set_id,
    cell_id: packet.cell_id,
    status: "DELIVERED_UNVERIFIED",
    output_manifest: [],
    focused_tests_passed: 4,
    focused_tests_failed: 0,
    acceptance_credit: 0,
  };
  const terminalHash = hash(terminalPacket);
  apply("TERMINAL_RECORDED", { terminal_sha256: terminalHash, terminal: terminalPacket });

  const independentResult = {
    schema: "corvus.independent_result.v1",
    packet_sha256: packet.packet_sha256,
    terminal_sha256: terminalHash,
    validator_profile: "fresh-eyes:s05-independent",
    validator_ancestry: "validator-ancestry:s05-independent",
    implementation_ancestry: "worker-ancestry:s05-implementation",
    verdict: "PASS",
    rerun_evidence: { focused: true, cumulative: true, independent: true },
    gaps: [],
  };
  const independentHash = hash(independentResult);
  apply("INDEPENDENT_VALIDATED", {
    independent_result_sha256: independentHash,
    independent_result: independentResult,
  });
  assert.equal(lifecycle.lifecycle_state, "INDEPENDENT_VALIDATED");
  assert.equal(lifecycle.terminal_fence, "OPEN");

  apply("RESULT_RECORDED", {
    independent_result_sha256: independentHash,
    cstar_acceptance: "SEPARATE_TRANSITION_REQUIRED",
  });
  assert.equal(events.filter((event) => event.event_type === "TERMINAL_RECORDED").length, 1);
  assert.equal(events.filter((event) => event.event_type === "INDEPENDENT_VALIDATED").length, 1);
  assert.equal(lifecycle.lifecycle_state, "RESULT_RECORDED");
  assert.notEqual(lifecycle.lifecycle_state, "CLOSED");
  assert.equal(lifecycle.terminal_fence, "OPEN");
});
