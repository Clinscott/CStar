import assert from "node:assert/strict";
import test from "node:test";
import { canonicalSha256 } from "../src/canonical.js";
import {
  createEffectState,
  createSetRecord,
  observeInbox,
  reserveEffect,
  EffectError,
} from "../src/effects.js";

const hash = (value: unknown) => canonicalSha256(value);
const set = createSetRecord({
  set_id: "CSO-ORGANISM-V0-EFFECTS", plan_id: "plan:s02", intent_envelope_sha256: hash("intent"),
  decision_id: "decision:s02", bead_id: "bead:s02", controller_generation: "generation:01",
  scope: "brain:CStar", work_packet_hashes: [hash("packet")], capability_profile_hash: hash("profile"),
  requested_model: "gpt-5.6-luna", requested_reasoning: "max", lease: { attempt: 1, retry_budget: 0 },
  ceilings: { descendants: 0, retries: 0 }, retry_budget: 0, terminal_schema: "corvus.terminal_packet.v1",
  validation_requirements: { independent: true }, protected_gates: [],
});
const input = {
  cell_id: "cell:s02:001", payload: { controller_endpoint: "project-controller://CStar" },
  input_manifest: [{ path: "organism-v0/src/canonical.ts", sha256: hash("canonical") }],
  output_allowlist: ["organism-v0/src/effects.ts"],
};

function reservation() { return reserveEffect({ state: createEffectState(set), ...input }); }

test("100 deterministic reservation replay pairs create one byte-identical effect", () => {
  for (let pair = 0; pair < 100; pair += 1) {
    const first = reservation();
    const replay = reserveEffect({ state: first.state, ...input });
    assert.equal(replay.replayed, true);
    assert.equal(first.effect.effect_id, replay.effect.effect_id);
    assert.equal(canonicalSha256(first.effect), canonicalSha256(replay.effect));
    assert.equal(replay.state.outbox.length, 1);
  }
});

test("same key with changed payload rejects without a second effect", () => {
  const first = reserveEffect({ state: createEffectState(set), ...input, idempotency_key: "fixed-key" });
  assert.throws(() => reserveEffect({ state: first.state, ...input, idempotency_key: "fixed-key", payload: { changed: true } }),
    (error: unknown) => error instanceof EffectError && error.code === "IDEMPOTENCY_CONFLICT");
  assert.equal(first.state.outbox.length, 1);
});

test("inbox requires reservation and maps one typed ACK", () => {
  const fresh = createEffectState(set);
  const unreserved = { effect_id: "effect:missing", idempotency_key: "missing", transport_status: "ACK" as const };
  assert.throws(() => observeInbox(fresh, unreserved),
    (error: unknown) => error instanceof EffectError && error.code === "UNRESERVED_INBOX");
  const reserved = reservation();
  const accepted = observeInbox(reserved.state, {
    effect_id: reserved.effect.effect_id, idempotency_key: reserved.effect.idempotency_key,
    transport_status: "ACK", host_task_id: "task:1", host_turn_id: "turn:1",
    requested_model: "gpt-5.6-luna", requested_reasoning: "max", actual_identity: "unreported",
    received_at_measured: "2026-08-15T00:00:00Z", result: { ok: true },
  });
  assert.equal(accepted.inbox.transport_status, "ACK");
  assert.equal(accepted.state.outbox[0]?.status, "ACKED");
  assert.equal(accepted.state.inbox.length, 1);
  const replay = observeInbox(accepted.state, {
    effect_id: accepted.inbox.effect_id, idempotency_key: accepted.inbox.idempotency_key,
    transport_status: "ACK", host_task_id: "task:1", host_turn_id: "turn:1",
    requested_model: "gpt-5.6-luna", requested_reasoning: "max", actual_identity: "unreported",
    received_at_measured: "2026-08-15T00:00:00Z", result: { ok: true }, observed_state_revision: accepted.state.revision,
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.state.inbox.length, 1);
});

test("inbox preserves supplied identity evidence and defaults absent identity", () => {
  const reserved = reservation();
  const attested = observeInbox(reserved.state, {
    effect_id: reserved.effect.effect_id, idempotency_key: reserved.effect.idempotency_key,
    transport_status: "ACK", actual_identity: "host-attestation:cell-1", received_at_measured: "measured:1",
  });
  assert.equal(attested.inbox.actual_identity, "host-attestation:cell-1");
  const defaulted = observeInbox(reservation().state, {
    effect_id: reservation().effect.effect_id, idempotency_key: reservation().effect.idempotency_key,
    transport_status: "ACK", received_at_measured: "measured:2",
  });
  assert.equal(defaulted.inbox.actual_identity, "unreported");
});

test("nested effect payload authority and lifecycle keys fail closed", () => {
  for (const payload of [
    { nested: { authority: "forged" } },
    { nested: [{ operator_grant: { allow: true } }] },
    { nested: { transcript: "history" } },
    { nested: { callback: "transport://callback" } },
    { nested: { lifecycle_authority: { accepted: true } } },
  ]) {
    assert.throws(() => reserveEffect({ state: createEffectState(set), ...input, payload }),
      (error: unknown) => error instanceof EffectError && error.code === "INVALID_EFFECT");
  }
});

test("effect path bindings reject unsafe entries and permit no output artifact", () => {
  for (const path of ["/absolute/path", "a/../b", "a\\b", "a\0b", "a/./b"]) {
    assert.throws(() => reserveEffect({ state: createEffectState(set), ...input,
      input_manifest: [{ path, sha256: hash("path") }] }),
      (error: unknown) => error instanceof EffectError && error.code === "INVALID_EFFECT");
  }
  const readOnly = reserveEffect({ state: createEffectState(set), ...input, output_allowlist: undefined });
  assert.equal(readOnly.replayed, false);
});
