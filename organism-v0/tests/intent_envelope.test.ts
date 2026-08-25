import assert from "node:assert/strict";
import test from "node:test";
import {
  createIntentEnvelope,
  deriveIdentifier,
  verifyIntentEnvelope,
  IntentVerificationError,
} from "../src/intent.js";
import { sha256Hex } from "../src/canonical.js";

const source = {
  host_id: "codex-host",
  source_thread_id: "thread-01",
  source_turn_id: "turn-01",
  attestation: "host-attestation-unreported",
} as const;

const grant = {
  grant_type: "ROOT_AUTHORITY" as const,
  grant_id: "grant-01",
  scope: "brain:CStar",
};

function sampleEnvelope(rawText = "operator status\n") {
  return createIntentEnvelope({
    raw_text_utf8: rawText,
    source,
    received_at_measured: "2026-08-15T10:00:00-04:00",
    operator_grant_refs: [grant],
    requested_scope_hints: ["brain:CStar"],
    requested_protected_effects: [],
    policy_version: "organism-v0-policy-1",
  });
}

test("intent envelope preserves raw UTF-8 bytes and verifies typed authority", () => {
  const raw = "  opérateur\nstatus\t✓  ";
  const envelope = sampleEnvelope(raw);
  const result = verifyIntentEnvelope(envelope);

  assert.equal(result.valid, true);
  assert.equal(result.schema_valid, true);
  assert.equal(result.source_valid, true);
  assert.equal(result.hash_valid, true);
  assert.equal(result.authority_granted, true);
  assert.equal(envelope.raw_text_utf8, raw);
  assert.equal(envelope.raw_text_sha256, sha256Hex(raw));
  assert.equal(envelope.normalized_text_utf8, "opérateur status ✓");
  assert.equal(envelope.parse_outcome, "ACCEPTED");
});

test("unknown fields, raw-byte changes, and missing grants fail closed", () => {
  const envelope = sampleEnvelope();
  const unknown = { ...envelope, invented_id: "from prose" } as unknown;
  assert.equal(verifyIntentEnvelope(unknown).valid, false);

  const changedRaw = { ...envelope, raw_text_utf8: "changed" } as unknown;
  assert.equal(verifyIntentEnvelope(changedRaw).valid, false);

  const noGrant = createIntentEnvelope({
    raw_text_utf8: envelope.raw_text_utf8,
    source,
    received_at_measured: envelope.received_at_measured,
    operator_grant_refs: [],
    requested_scope_hints: [],
    requested_protected_effects: [],
    policy_version: "organism-v0-policy-1",
  });
  const noGrantResult = verifyIntentEnvelope(noGrant);
  assert.equal(noGrantResult.valid, false);
  assert.equal(noGrantResult.authority_granted, false);
});

test("identifiers derive from verified parent hash, ordinal, and action bytes only", () => {
  const envelope = sampleEnvelope("operator supplied mission-999\n");
  const first = deriveIdentifier(envelope, 0, { action: "INTENT_VERIFIED" });
  const second = deriveIdentifier(envelope, 0, { action: "INTENT_VERIFIED" });
  const differentOrdinal = deriveIdentifier(envelope, 1, { action: "INTENT_VERIFIED" });
  assert.equal(first, second);
  assert.notEqual(first, differentOrdinal);
  assert.match(first, /^[0-9a-f]{64}$/u);

  const tampered = { ...envelope, envelope_sha256: "0".repeat(64) } as unknown;
  assert.throws(
    () => deriveIdentifier(tampered, 0, { action: "INTENT_VERIFIED" }),
    (error: unknown) => error instanceof IntentVerificationError,
  );
});

