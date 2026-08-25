import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, canonicalSha256 } from "../src/canonical.js";
import { createIntentEnvelope } from "../src/intent.js";
import { createSetRecord } from "../src/work_packets.js";
import {
  MANUAL_FIXTURE_EFFECT_KIND, MANUAL_FIXTURE_ID, cancelManualLane, continueManualLane,
  revokeManualLane, runManualEmergencyLane, verifyManualEmergencyReceipt, ManualLaneError,
} from "../src/manual_lane.js";

const scope = "brain:CStar/organism-v0/manual-lane";
const generation = "CSO-ORGANISM-V0-S04-GENERATION-01";
const grant = { grant_type: "ROOT_AUTHORITY" as const, grant_id: "grant:s04:fixture", scope };
const intent = createIntentEnvelope({ raw_text_utf8: "authorize one manual fixture effect",
  source: { host_id: "host:s04", source_thread_id: "thread:s04", source_turn_id: "turn:s04", attestation: { verified: true } },
  received_at_measured: "2026-08-15T12:00:00-04:00", operator_grant_refs: [grant], requested_scope_hints: [scope],
  requested_protected_effects: [], policy_version: "corvus-policy-v0", parse_outcome: "ACCEPTED" });
const set = createSetRecord({ set_id: "CSO-ORGANISM-V0-MANUAL-SET-01", plan_id: "plan:s04", intent_envelope_sha256: intent.envelope_sha256,
  decision_id: "decision:s04", bead_id: "bead:s04", controller_generation: generation, scope,
  work_packet_hashes: [canonicalSha256("manual packet")], capability_profile_hash: canonicalSha256("manual profile"),
  requested_model: "gpt-5.6-luna", requested_reasoning: "max", lease: { attempt: 1, retry_budget: 0 },
  ceilings: { attempts: 1, descendants: 0, retries: 0 }, retry_budget: 0, terminal_schema: "corvus.terminal_packet.v1",
  validation_requirements: { focused: 18 }, protected_gates: [] });
const effect = { effect_id: "manual-effect:fixture-01", effect_kind: MANUAL_FIXTURE_EFFECT_KIND,
  fixture_id: MANUAL_FIXTURE_ID, payload: { fixture: "ok" }, write_allowlist: ["organism-v0/src/manual_lane.ts"], scope,
  set_id: set.set_id, controller_generation: generation };
const base = { lane_id: "lane:s04:01", operator_grant: grant, intent, set, scope, controller_generation: generation,
  write_allowlist: ["organism-v0/src/manual_lane.ts"], effects: [effect], measured_start: "m:start", measured_end: "m:end" };
function request(overrides: Record<string, unknown> = {}): Record<string, unknown> { return { ...base, ...overrides }; }
function expectReject(action: () => unknown, code?: ManualLaneError["code"]): void {
  assert.throws(action, (error: unknown) => error instanceof ManualLaneError && (code === undefined || error.code === code));
}

test("valid typed verified ROOT_AUTHORITY grant authorizes one declared fixture effect", () => {
  const outcome = runManualEmergencyLane(request());
  assert.equal(verifyManualEmergencyReceipt(outcome.receipt), true);
  assert.equal(outcome.receipt.schema, "corvus.manual_emergency_receipt.v1");
  assert.equal(outcome.receipt.ack, "ACK");
  assert.equal(outcome.effect_count, 1);
  assert.equal(outcome.terminal_count, 1);
});

test("missing operator grant rejects fail-closed", () => {
  expectReject(() => runManualEmergencyLane(request({ operator_grant: undefined })), "AUTHORITY_REQUIRED");
});

test("unverified or non-root grant rejects fail-closed", () => {
  expectReject(() => runManualEmergencyLane(request({ operator_grant: { ...grant, grant_type: "OPERATOR" } })), "AUTHORITY_REQUIRED");
  expectReject(() => runManualEmergencyLane(request({ operator_grant: { ...grant, extra: true } })), "AUTHORITY_REQUIRED");
});

test("grant scope mismatch rejects", () => {
  expectReject(() => runManualEmergencyLane(request({ operator_grant: { ...grant, scope: "other-scope" } })), "SCOPE_MISMATCH");
});

test("intent SET or scope mismatch rejects", () => {
  expectReject(() => runManualEmergencyLane(request({ scope: "other-scope" })), "SCOPE_MISMATCH");
  expectReject(() => runManualEmergencyLane(request({ set_id: "other-set" })), "SET_MISMATCH");
});

test("zero or multiple effects reject", () => {
  expectReject(() => runManualEmergencyLane(request({ effects: [] })), "EFFECT_COUNT");
  expectReject(() => runManualEmergencyLane(request({ effects: [effect, effect] })), "EFFECT_COUNT");
});

test("write allowlist mismatch or path escape rejects", () => {
  expectReject(() => runManualEmergencyLane(request({ write_allowlist: ["organism-v0/src/other.ts"] })), "ALLOWLIST_MISMATCH");
  expectReject(() => runManualEmergencyLane(request({ write_allowlist: ["../escape.ts"] })), "ALLOWLIST_MISMATCH");
});

test("requested protected effect rejects", () => {
  expectReject(() => runManualEmergencyLane(request({ protected_effects: ["activation"] })), "PROTECTED_EFFECT");
});

test("retry budget above zero rejects", () => {
  expectReject(() => runManualEmergencyLane(request({ retry_budget: 1 })), "RETRY_BUDGET");
});

test("automatic continuation fallback or escalation rejects", () => {
  expectReject(() => runManualEmergencyLane(request({ automatic_continuation: true })), "AUTOMATIC_CONTINUATION");
  expectReject(() => runManualEmergencyLane(request({ fallback: true })), "AUTOMATIC_CONTINUATION");
  expectReject(() => runManualEmergencyLane(request({ escalation: true })), "AUTOMATIC_CONTINUATION");
});

test("cancellation emits exactly one terminal and fences execution", () => {
  const outcome = runManualEmergencyLane(request({ command: "CANCELLED" }));
  assert.equal(outcome.terminal?.status, "CANCELLED");
  assert.equal(outcome.metrics.terminals, 1);
  assert.equal(outcome.metrics.effects, 0);
  expectReject(() => continueManualLane(outcome.state), "TERMINAL_FENCE");
});

test("revocation emits exactly one terminal and fences execution", () => {
  const outcome = runManualEmergencyLane(request({ command: "REVOKED" }));
  assert.equal(outcome.terminal?.status, "REVOKED");
  assert.equal(outcome.metrics.terminals, 1);
  expectReject(() => continueManualLane(outcome.state), "TERMINAL_FENCE");
});

test("duplicate cancellation or revocation is idempotent with zero second terminal", () => {
  const cancelled = runManualEmergencyLane(request({ command: "CANCELLED" }));
  const cancelledAgain = runManualEmergencyLane(request({ command: "CANCELLED", state: cancelled.state }));
  assert.equal(cancelledAgain.replayed, true); assert.equal(cancelledAgain.terminal, null); assert.equal(cancelledAgain.terminal_count, 0);
  const revoked = runManualEmergencyLane(request({ command: "REVOKED" }));
  const revokedAgain = runManualEmergencyLane(request({ command: "REVOKED", state: revoked.state }));
  assert.equal(revokedAgain.replayed, true); assert.equal(revokedAgain.terminal_count, 0);
});

test("stale controller generation rejects", () => {
  expectReject(() => runManualEmergencyLane(request({ controller_generation: "old-generation" })), "STALE_GENERATION");
});

test("canonical receipt and hash replay identically for 100 of 100 pairs", () => {
  const first = runManualEmergencyLane(request());
  for (let pair = 0; pair < 100; pair += 1) {
    const replay = runManualEmergencyLane(request());
    assert.equal(replay.receipt_bytes, first.receipt_bytes);
    assert.equal(replay.receipt_sha256, first.receipt_sha256);
    assert.equal(canonicalJson(replay.receipt), first.receipt_bytes);
  }
});

test("unknown fields and malformed objects reject", () => {
  expectReject(() => runManualEmergencyLane(request({ unknown_field: true })), "INVALID_REQUEST");
  expectReject(() => runManualEmergencyLane(null), "INVALID_REQUEST");
  expectReject(() => runManualEmergencyLane(request({ effects: [{ ...effect, unknown_field: true }] })), "INVALID_REQUEST");
});

test("requested and actual identity remain separate with unreported supported", () => {
  const unreported = runManualEmergencyLane(request());
  assert.equal((unreported.receipt.result as { actual_identity: string }).actual_identity, "unreported");
  const attested = runManualEmergencyLane(request({ actual_identity: "host-attestation:s04" }));
  const result = attested.receipt.result as { requested_model: string; requested_reasoning: string; actual_identity: string };
  assert.equal(result.requested_model, "gpt-5.6-luna"); assert.equal(result.requested_reasoning, "max");
  assert.equal(result.actual_identity, "host-attestation:s04");
});

test("metrics are deterministic and unsupported values are unavailable or BUDGET_OVERSHOOT", () => {
  const metrics = runManualEmergencyLane(request()).metrics;
  assert.deepEqual(metrics, { effects: 1, terminals: 1, retries: 0, descendants: 0, calls: 0, waits: 0,
    model_calls: 0, provider_calls: 0, tool_calls: 0, token_usage: "unavailable", overshoot: "unavailable" });
});
