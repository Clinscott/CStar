import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalSha256,
  verifySelfHash,
  withSelfHash,
} from "../src/canonical.js";
import {
  appendJournalEvent,
  createSnapshot,
  emptyJournal,
  journalSha256,
  verifyJournal,
  verifySnapshot,
} from "../src/journal.js";
import { initialState, makeReducerEvent, reduce } from "../src/reducer.js";

const hash = (value: unknown) => canonicalSha256(value);
const scope = "brain:CStar/organism-v0/s05/transfer";
const generation = "CSO-ORGANISM-V0-S05-GENERATION-01";

test("transfer checkpoint binds journal, snapshot, source identity, and explicit gap", () => {
  let state = initialState(scope, generation);
  let journal = emptyJournal();
  const append = (eventType: "INTENT_RECEIVED" | "INTENT_VERIFIED", payload: unknown) => {
    const before = state;
    const event = makeReducerEvent({
      event_type: eventType,
      scope,
      controller_generation: generation,
      expected_revision: state.revision,
      payload,
    });
    const reduced = reduce(state, event);
    journal = appendJournalEvent(journal, {
      event_type: event.event_type,
      scope,
      controller_generation: generation,
      idempotency_key: event.idempotency_key,
      payload: event.payload,
      state_before: before,
      state_after: reduced.state,
      timestamp_measured: `measured:s05:transfer:${journal.revision + 1}`,
    });
    state = reduced.state;
  };

  append("INTENT_RECEIVED", { raw_text_sha256: hash("s05:transfer:intent") });
  append("INTENT_VERIFIED", { authority_granted: false, schema_valid: true });
  assert.equal(verifyJournal(journal).valid, true);
  const journalHash = journalSha256(journal);
  const snapshot = createSnapshot({
    revision: journal.revision,
    last_event_sha256: journal.events.at(-1)?.event_sha256 ?? null,
    state,
    outbox: [],
    inbox: [],
  });
  assert.equal(verifySnapshot(snapshot, journal, state, [], []).valid, true);

  const artifactManifest = [
    { path: "organism-v0/tests/negative_and_security.test.ts", sha256: hash("negative") },
    { path: "organism-v0/tests/unknown_recovery.test.ts", sha256: hash("unknown") },
    { path: "organism-v0/tests/happy_path.test.ts", sha256: hash("happy") },
    { path: "organism-v0/tests/transfer_checkpoint.test.ts", sha256: hash("transfer") },
    { path: "organism-v0/fixtures/incident_replay.json", sha256: hash("incident") },
  ];
  const checkpointBase = {
    schema: "corvus.transfer_checkpoint.v1",
    checkpoint_id: "CSF-D007-S05-INDEPENDENT-01",
    verdict: "TRANSFER_READY_WITH_GAP",
    predecessor_checkpoint_sha256: hash("S04-CSF-D007"),
    source_head: "afbbc1770ec6a7a2adc15b83f91c5586ac2525c0",
    source_tree: "d3c5c38ad511d771ed2d538de849485597e42d36",
    source_status_sha256: "58d8136307fd8ab9ca202c798caeed4c5ba64674c245aa8c9fa77cde225c8d69",
    journal_sha256: journalHash,
    snapshot_sha256: snapshot.snapshot_sha256,
    artifact_manifest_sha256: hash(artifactManifest),
    encryption_local_verification: "unavailable",
    runtime_bootstrap_parity: "unavailable",
    architecture: "organism-v0-flat-compatibility",
    restore_rehearsal: "unavailable",
    gaps: ["CStar lifecycle acceptance remains a separate transition"],
    protected_gates: [],
    timestamp_measured: "2026-08-15T12:00:00-04:00",
  };
  const checkpoint = withSelfHash(checkpointBase, "checkpoint_sha256");
  assert.equal(verifySelfHash(checkpoint, "checkpoint_sha256"), true);
  assert.equal(checkpoint.verdict, "TRANSFER_READY_WITH_GAP");
  assert.equal(checkpoint.gaps.length, 1);
  assert.equal(checkpoint.snapshot_sha256, snapshot.snapshot_sha256);
  assert.equal(checkpoint.journal_sha256, journalHash);
  assert.equal(checkpoint.artifact_manifest_sha256, hash(artifactManifest));
  assert.equal(Object.hasOwn(checkpoint, "operator_acceptance"), false);

  const tamperedSnapshot = { ...snapshot, state_sha256: hash("tampered") };
  assert.equal(verifySnapshot(tamperedSnapshot, journal, state, [], []).valid, false);
  assert.equal(verifySelfHash({ ...checkpoint, verdict: "TRANSFER_READY" }, "checkpoint_sha256"), false);
});
