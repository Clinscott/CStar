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

const h = (value: unknown) => canonicalSha256(value);
const set = createSetRecord({
  set_id: "set:project-controller", plan_id: "plan:1", intent_envelope_sha256: h("intent"),
  decision_id: "decision:1", bead_id: "bead:1", controller_generation: "generation:1", scope: "brain:CStar",
  work_packet_hashes: [h("packet")], capability_profile_hash: h("capability"), requested_model: "gpt-5.6-luna",
  requested_reasoning: "max", lease: { attempt: 1, wall_time_seconds: 3600 }, ceilings: { descendants: 0 },
  retry_budget: 0, terminal_schema: "corvus.terminal_packet.v1", validation_requirements: { independent: true },
  protected_gates: [],
});

test("project controller dispatch is reserved before an ACK observation", () => {
  const reserved = reserveEffect({
    state: createEffectState(set), cell_id: "cell:project-controller", effect_kind: PROJECT_CONTROLLER_DISPATCH,
    action: PROJECT_CONTROLLER_DISPATCH, payload: { controller_endpoint: "project-controller://CStar", controller_task_identity: "task-template:1" },
    input_manifest: [{ path: "organism-v0/src/canonical.ts", sha256: h("canonical") }],
    output_allowlist: ["organism-v0/src/effects.ts"],
  });
  assert.equal(reserved.replayed, false);
  assert.equal(reserved.state.outbox.length, 1);
  assert.equal(reserved.effect.status, "RESERVED");
  const ack = observeInbox(reserved.state, {
    effect_id: reserved.effect.effect_id, idempotency_key: reserved.effect.idempotency_key,
    transport_status: "ACK", host_task_id: "host-task:1", host_turn_id: "host-turn:1",
    returned_thread_id: "thread:1", returned_turn_id: "turn:1", actual_identity: "unreported",
    requested_model: "gpt-5.6-luna", requested_reasoning: "max", received_at_measured: "measured:1",
    result: { dispatch_issued: true },
  });
  assert.equal(ack.state.outbox[0]?.status, "ACKED");
  assert.equal(ack.state.inbox.length, 1);
  assert.equal(ack.inbox.actual_identity, "unreported");
});
