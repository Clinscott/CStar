import assert from "node:assert/strict";
import test from "node:test";
import { canonicalSha256 } from "../src/canonical.js";
import {
  createEffectState,
  createInboxRecord,
  createSetRecord,
  PROJECT_CONTROLLER_DISPATCH,
  reserveEffect,
  type EffectOutboxRecord,
} from "../src/effects.js";
import { createWorkPacket } from "../src/work_packets.js";
import {
  invokeNativeTaskControl,
  TransportBoundaryError,
  verifyTransportEvidence,
} from "../src/transport.js";

const h = (value: unknown) => canonicalSha256(value);
const packet = createWorkPacket({
  packet_id: "packet:transport", set_id: "set:transport", cell_id: "cell:transport",
  controller_generation: "generation:1", scope: "brain:CStar", action: "S03_TRANSPORT",
  input_manifest: [{ path: "organism-v0/src/canonical.ts", sha256: h("canonical") }],
  write_allowlist: ["organism-v0/src/transport.ts", "organism-v0/tests/transport_boundary.test.ts"],
  output_allowlist: ["organism-v0/src/transport.ts", "organism-v0/tests/transport_boundary.test.ts"],
  requested_model: "gpt-5.6-luna", requested_reasoning: "max", actual_identity: "unreported",
  lease: { attempt: 1, wall_time_seconds: 3600 }, ceilings: { descendants: 0, calls: 1, waits: 1 },
  retry_budget: 0, terminal_schema: "corvus.terminal_packet.v1", tests: ["transport_boundary"],
  protected_gates: [], transfer_checkpoint_ref: "checkpoint:S02",
});

function effectFor(payload: unknown): EffectOutboxRecord {
  const set = createSetRecord({
    set_id: "set:transport", plan_id: "plan:transport", intent_envelope_sha256: h("intent"),
    decision_id: "decision:transport", bead_id: "bead:transport", controller_generation: "generation:1",
    scope: "brain:CStar", work_packet_hashes: [packet.packet_sha256], capability_profile_hash: h("capability"),
    requested_model: "gpt-5.6-luna", requested_reasoning: "max", lease: { attempt: 1, wall_time_seconds: 3600 },
    ceilings: { descendants: 0, calls: 1, waits: 1 }, retry_budget: 0,
    terminal_schema: "corvus.terminal_packet.v1", validation_requirements: { independent: true },
    protected_gates: [],
  });
  return reserveEffect({
    state: createEffectState(set), cell_id: "cell:transport", effect_kind: PROJECT_CONTROLLER_DISPATCH,
    action: PROJECT_CONTROLLER_DISPATCH, payload,
    input_manifest: [{ path: "organism-v0/src/canonical.ts", sha256: h("canonical") }],
    output_allowlist: ["organism-v0/src/transport.ts", "organism-v0/tests/transport_boundary.test.ts"],
  }).effect;
}

function inputFor(kind: string, payload: unknown, executor: (request: any, binding: any) => unknown, extra: Record<string, unknown> = {}) {
  return {
    effect: effectFor(payload), packet, payload,
    request: kind === "TASK_WAIT" ? { kind, task_id: "task:1", timeout_ms: 100 } : { kind, task_id: "task:1" },
    executor, ...extra,
  } as any;
}

const ack = (request: any) => ({ status: "ACK", terminal: true, result: { accepted: request.kind } });

test("TASK_CREATE maps a valid terminal native response to ACK", async () => {
  const result = await invokeNativeTaskControl(inputFor("TASK_CREATE", { operation: "create" }, ack));
  assert.equal(result.status, "ACK");
  assert.equal(result.evidence.request.kind, "TASK_CREATE");
  assert.equal(result.evidence.native_call_count, 1);
});

test("TASK_RESUME binds the exact native request", async () => {
  const requestSeen: any[] = [];
  const result = await invokeNativeTaskControl(inputFor("TASK_RESUME", { operation: "resume" }, (request) => {
    requestSeen.push(request);
    return { status: "ACK", terminal: true };
  }));
  assert.equal(result.status, "ACK");
  assert.deepEqual(requestSeen[0], result.evidence.request);
  assert.equal(result.evidence.request_sha256, h(result.evidence.request));
});

test("TASK_FORK is a single injected transport call", async () => {
  let calls = 0;
  const result = await invokeNativeTaskControl(inputFor("TASK_FORK", { operation: "fork" }, () => {
    calls += 1;
    return { status: "ACK", terminal: true, result: { task_id: "task:fork" } };
  }));
  assert.equal(result.status, "ACK");
  assert.equal(calls, 1);
});

test("TASK_SEND preserves an explicit host task identifier", async () => {
  const result = await invokeNativeTaskControl(inputFor("TASK_SEND", { operation: "send" }, () => ({
    status: "ACK", terminal: true, host_task_id: "host-task:1", host_turn_id: "host-turn:1",
  })));
  assert.equal(result.status, "ACK");
  assert.equal(result.inbox_observation.host_task_id, "host-task:1");
  assert.equal(result.inbox_observation.host_turn_id, "host-turn:1");
});

test("TASK_WAIT performs exactly one bounded wait", async () => {
  let calls = 0;
  const result = await invokeNativeTaskControl(inputFor("TASK_WAIT", { operation: "wait" }, (request) => {
    calls += 1;
    assert.equal(request.timeout_ms, 100);
    return { status: "ACK", terminal: true, result: { completed: true } };
  }));
  assert.equal(result.status, "ACK");
  assert.equal(calls, 1);
  assert.equal(result.evidence.bounded_wait_count, 1);
  assert.equal(result.evidence.poll_count, 0);
});

test("TASK_READ maps the sixth effect kind", async () => {
  const result = await invokeNativeTaskControl(inputFor("TASK_READ", { operation: "read" }, ack));
  assert.equal(result.status, "ACK");
  assert.equal(result.evidence.request.kind, "TASK_READ");
});

test("a non-RESERVED outbox effect is rejected before invocation", async () => {
  let calls = 0;
  const input = inputFor("TASK_READ", { operation: "reservation" }, () => {
    calls += 1;
    return { status: "ACK", terminal: true };
  });
  input.effect = { ...input.effect, status: "ACKED" };
  await assert.rejects(invokeNativeTaskControl(input), (error: unknown) =>
    error instanceof TransportBoundaryError && error.code === "RESERVATION_REQUIRED");
  assert.equal(calls, 0);
});

test("payload bytes must match the reserved payload hash", async () => {
  let calls = 0;
  const input = inputFor("TASK_READ", { operation: "payload-bound" }, () => {
    calls += 1;
    return { status: "ACK", terminal: true };
  });
  input.payload = { operation: "different" };
  await assert.rejects(invokeNativeTaskControl(input), (error: unknown) =>
    error instanceof TransportBoundaryError && error.code === "PAYLOAD_CONFLICT");
  assert.equal(calls, 0);
});

test("an explicit native failure maps to FAILURE", async () => {
  const result = await invokeNativeTaskControl(inputFor("TASK_SEND", { operation: "failure" }, () => ({
    status: "FAILURE", terminal: true, failure_code: "NATIVE_DENIED",
  })));
  assert.equal(result.status, "FAILURE");
  assert.equal(result.evidence.failure_code, "NATIVE_DENIED");
});

test("a thrown executor outcome maps to UNKNOWN", async () => {
  const result = await invokeNativeTaskControl(inputFor("TASK_CREATE", { operation: "thrown" }, () => {
    throw new Error("native transport failed");
  }));
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.evidence.failure_code, "EXECUTOR_THROWN_OR_NO_RESPONSE");
});

test("a malformed response maps to UNKNOWN", async () => {
  const result = await invokeNativeTaskControl(inputFor("TASK_READ", { operation: "malformed" }, () => ({
    status: "ACK",
  })));
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.evidence.failure_code, "NONTERMINAL_OR_AMBIGUOUS_RESPONSE");
});

test("a conflicting response maps to UNKNOWN", async () => {
  const result = await invokeNativeTaskControl(inputFor("TASK_RESUME", { operation: "conflict" }, () => ({
    status: "ACK", terminal: true, failure_code: "also-failed",
  })));
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.evidence.failure_code, "CONFLICTING_RESPONSE");
});

test("a nonterminal response maps to UNKNOWN", async () => {
  const result = await invokeNativeTaskControl(inputFor("TASK_WAIT", { operation: "nonterminal" }, () => ({
    status: "ACK", terminal: false,
  })));
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.evidence.terminal_observed, false);
});

test("requested model and reasoning remain separate from actual identity", async () => {
  const result = await invokeNativeTaskControl(inputFor("TASK_CREATE", { operation: "identity" }, ack, {
    requested_model: "gpt-5.6-luna", requested_reasoning: "max", actual_identity: "unreported",
  }));
  assert.equal(result.evidence.requested_model, "gpt-5.6-luna");
  assert.equal(result.evidence.requested_reasoning, "max");
  assert.equal(result.evidence.actual_identity, "unreported");
});

test("native metadata does not grant lifecycle or root authority", async () => {
  const result = await invokeNativeTaskControl(inputFor("TASK_READ", { operation: "authority" }, () => ({
    status: "ACK", terminal: true, lifecycle_authority: "root",
  })));
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.evidence.authority_granted, false);
  assert.equal(result.evidence.lifecycle_mutated, false);
  assert.equal(result.evidence.root_authority, "none");
});

test("retry, polling, fallback, and continuation counters remain zero", async () => {
  const result = await invokeNativeTaskControl(inputFor("TASK_FORK", { operation: "ceilings" }, () => ({
    status: "ACK", terminal: true,
  })));
  assert.deepEqual([
    result.evidence.poll_count, result.evidence.retry_count, result.evidence.replay_count,
    result.evidence.replacement_count, result.evidence.fallback_count, result.evidence.continuation_count,
    result.evidence.duplicate_external_effects,
  ], [0, 0, 0, 0, 0, 0, 0]);
});

test("canonical evidence replays identically without a second transport call", async () => {
  const payload = { operation: "replay" };
  let calls = 0;
  const input = inputFor("TASK_READ", payload, () => {
    calls += 1;
    return { status: "ACK", terminal: true, result: { same: true } };
  });
  const first = await invokeNativeTaskControl(input);
  const second = await invokeNativeTaskControl(input);
  assert.equal(first.evidence.evidence_sha256, second.evidence.evidence_sha256);
  assert.equal(calls, 2);
  assert.equal(verifyTransportEvidence(first.evidence), true);
});

test("the returned observation is closed for later inbox construction", async () => {
  const result = await invokeNativeTaskControl(inputFor("TASK_CREATE", { operation: "inbox" }, () => ({
    status: "ACK", terminal: true, result: { accepted: true },
  })));
  const inbox = createInboxRecord(result.inbox_observation);
  assert.equal(inbox.transport_status, "ACK");
  assert.equal(inbox.result_sha256, result.evidence.result_sha256);
});
