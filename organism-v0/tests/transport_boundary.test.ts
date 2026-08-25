import assert from "node:assert/strict";
import test from "node:test";
import { canonicalSha256, hashOmittingField } from "../src/canonical.js";
import {
  createEffectState,
  createSetRecord,
  PROJECT_CONTROLLER_DISPATCH,
  reserveEffect,
  type EffectState,
} from "../src/effects.js";
import {
  createNativeTaskControlAdapter,
  TASK_CONTROL_KINDS,
  TASK_CREATE,
  TASK_WAIT,
  toInboxObservation,
  TransportBoundaryError,
  verifyTransportEvidence,
} from "../src/transport.js";

const hash = (value: unknown) => canonicalSha256(value);
const set = createSetRecord({
  set_id: "set:transport", plan_id: "plan:transport", intent_envelope_sha256: hash("intent"),
  decision_id: "decision:transport", bead_id: "bead:transport", controller_generation: "generation:1",
  scope: "brain:CStar", work_packet_hashes: [hash("packet")], capability_profile_hash: hash("capability"),
  requested_model: "gpt-5.6-luna", requested_reasoning: "max", lease: { attempt: 1, wall_time_seconds: 3600 },
  ceilings: { descendants: 0, provider_calls: 0 }, retry_budget: 0, terminal_schema: "corvus.terminal_packet.v1",
  validation_requirements: { independent: true }, protected_gates: [],
});

function reserved(kind = TASK_CREATE, sequence = 1): { state: EffectState; payload: Record<string, unknown> } {
  const payload = { packet_sha256: hash(`packet:${sequence}`), operation: "dispatch", sequence };
  const state = reserveEffect({
    state: createEffectState(set), cell_id: `cell:transport:${sequence}`, sequence,
    effect_kind: PROJECT_CONTROLLER_DISPATCH, action: PROJECT_CONTROLLER_DISPATCH, payload,
    input_manifest: [{ path: "organism-v0/src/canonical.ts", sha256: hash("canonical") }],
    output_allowlist: ["organism-v0/src/transport.ts"],
  });
  return { state: state.state, payload };
}

function input(state: EffectState, payload: Record<string, unknown>, kind: string, request?: Record<string, unknown>) {
  return {
    state, effect: state.outbox[0], packet_sha256: payload.packet_sha256 as string, payload,
    native_request: request ?? { task_kind: kind, task_input: { cell: "transport" } },
  };
}

test("all six native task-control effects are accepted", async () => {
  for (const [index, kind] of TASK_CONTROL_KINDS.entries()) {
    const prepared = reserved(kind, index + 1);
    const adapter = createNativeTaskControlAdapter((request) => ({
      status: "ACK", host_task_id: `task:${kind}`, actual_identity: "unreported",
      terminal: kind === TASK_WAIT, echoed_kind: request.task_kind,
    }));
    const evidence = await adapter.invoke(input(prepared.state, prepared.payload, kind));
    assert.equal(evidence.transport_status, "ACK");
    assert.equal(evidence.task_kind, kind);
    assert.equal(evidence.effect_id, prepared.state.outbox[0]?.effect_id);
    assert.equal(evidence.wait_count, kind === TASK_WAIT ? 1 : 0);
  }
});

test("an unreserved effect is rejected before the injected executor", async () => {
  const prepared = reserved();
  let calls = 0;
  const adapter = createNativeTaskControlAdapter(() => { calls += 1; return { status: "ACK", host_task_id: "task:1" }; });
  const unreserved = { ...prepared.state.outbox[0], status: "ACKED" as const };
  await assert.rejects(() => adapter.invoke({ ...input(prepared.state, prepared.payload, TASK_CREATE), effect: unreserved }),
    (error: unknown) => error instanceof TransportBoundaryError && error.code === "UNRESERVED_EFFECT");
  assert.equal(calls, 0);
});

test("one call and canonical replay prevent duplicate external effects", async () => {
  const prepared = reserved();
  let calls = 0;
  const adapter = createNativeTaskControlAdapter(() => {
    calls += 1;
    return { status: "ACK", host_task_id: "task:replay", actual_identity: "unreported" };
  });
  const first = await adapter.invoke(input(prepared.state, prepared.payload, TASK_CREATE));
  const second = await adapter.invoke(input(prepared.state, prepared.payload, TASK_CREATE));
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
  assert.equal(first.native_call_count, 1);
  assert.equal(first.duplicate_external_effects, 0);
  assert.equal(verifyTransportEvidence(first), true);
  assert.equal(hashOmittingField(first, "evidence_sha256"), first.evidence_sha256);
});

test("typed failure maps to FAILURE and preserves selector identity separation", async () => {
  const prepared = reserved();
  const adapter = createNativeTaskControlAdapter(() => ({
    status: "FAILURE", failure_code: "HOST_REJECTED", actual_identity: "host:worker-1",
    requested_model: "gpt-5.6-luna", requested_reasoning: "max",
  }));
  const evidence = await adapter.invoke(input(prepared.state, prepared.payload, TASK_CREATE));
  assert.equal(evidence.transport_status, "FAILURE");
  assert.equal(evidence.failure_code, "HOST_REJECTED");
  assert.equal(evidence.actual_identity, "host:worker-1");
  assert.equal(evidence.requested_model, "gpt-5.6-luna");
  assert.equal(evidence.requested_reasoning, "max");
});

test("thrown, malformed, conflicting, nonterminal, and exhausted observations map UNKNOWN", async () => {
  const thrown = reserved(undefined, 1);
  const thrownAdapter = createNativeTaskControlAdapter(() => { throw new Error("delivery uncertain"); });
  assert.equal((await thrownAdapter.invoke(input(thrown.state, thrown.payload, TASK_CREATE))).transport_status, "UNKNOWN");

  const malformed = reserved(undefined, 2);
  const malformedAdapter = createNativeTaskControlAdapter(() => ({ status: "ACK", actual_identity: "unreported" }));
  assert.equal((await malformedAdapter.invoke(input(malformed.state, malformed.payload, TASK_CREATE))).transport_status, "UNKNOWN");

  const conflict = reserved(undefined, 3);
  const conflictAdapter = createNativeTaskControlAdapter(() => ({
    status: "ACK", host_task_id: "task:1", taskId: "task:2", actual_identity: "unreported",
  }));
  assert.equal((await conflictAdapter.invoke(input(conflict.state, conflict.payload, TASK_CREATE))).transport_status, "UNKNOWN");

  const nonterminal = reserved(TASK_WAIT, 4);
  const nonterminalAdapter = createNativeTaskControlAdapter(() => ({
    status: "ACK", host_task_id: "task:wait", actual_identity: "unreported", terminal: false,
  }));
  assert.equal((await nonterminalAdapter.invoke(input(nonterminal.state, nonterminal.payload, TASK_WAIT))).transport_status, "UNKNOWN");

  const exhausted = reserved(TASK_WAIT, 5);
  const exhaustedAdapter = createNativeTaskControlAdapter(() => ({
    status: "FAILURE", failure_code: "WAIT_EXHAUSTED", host_task_id: "task:wait",
  }));
  const exhaustedEvidence = await exhaustedAdapter.invoke(input(exhausted.state, exhausted.payload, TASK_WAIT));
  assert.equal(exhaustedEvidence.transport_status, "UNKNOWN");
  assert.equal(exhaustedEvidence.failure_code, "WAIT_EXHAUSTED");
});

test("authority-bearing requests are rejected and authority-bearing responses do not grant authority", async () => {
  const prepared = reserved();
  let calls = 0;
  const adapter = createNativeTaskControlAdapter(() => { calls += 1; return { status: "ACK", host_task_id: "task:1" }; });
  await assert.rejects(() => adapter.invoke(input(prepared.state, prepared.payload, TASK_CREATE, {
    task_kind: TASK_CREATE, callback: "not authority",
  })), (error: unknown) => error instanceof TransportBoundaryError && error.code === "INVALID_REQUEST");
  assert.equal(calls, 0);

  const responseAdapter = createNativeTaskControlAdapter(() => ({
    status: "ACK", host_task_id: "task:1", actual_identity: "unreported", callback: { lifecycle: "grant" },
  }));
  const evidence = await responseAdapter.invoke(input(prepared.state, prepared.payload, TASK_CREATE));
  assert.equal(evidence.transport_status, "UNKNOWN");
  assert.equal(Object.hasOwn(evidence, "authority"), false);
});

test("wait uses one bounded native call and projects inbox-ready evidence", async () => {
  const prepared = reserved(TASK_WAIT);
  let calls = 0;
  const adapter = createNativeTaskControlAdapter(() => {
    calls += 1;
    return { status: "ACK", host_task_id: "task:wait", host_turn_id: "turn:wait", terminal: true, result: { done: true } };
  });
  const evidence = await adapter.invoke(input(prepared.state, prepared.payload, TASK_WAIT));
  assert.equal(calls, 1);
  assert.equal(evidence.native_call_count, 1);
  assert.equal(evidence.wait_count, 1);
  assert.equal(evidence.poll_count, 0);
  assert.equal(evidence.retry_count, 0);
  assert.equal(toInboxObservation(evidence).transport_status, "ACK");
});
