import assert from "node:assert/strict";
import test from "node:test";
import {
  appendJournalEvent,
  createSnapshot,
  emptyJournal,
  journalSha256,
  verifyJournal,
  verifySnapshot,
  JournalError,
} from "../src/journal.js";
import { canonicalSha256 } from "../src/canonical.js";
import { initialState, makeReducerEvent, reduce } from "../src/reducer.js";

const scope = "brain:CStar";
const generation = "manual-clean-break-20260815-01";

test("empty journal and hash-linked append are deterministic", () => {
  const empty = emptyJournal();
  assert.equal(canonicalSha256(empty), "29fe3483b48b173d6b9c697cf5bb3d5e8e25ffdaf18caad1832b5612a32759a2");
  assert.equal(verifyJournal(empty).valid, true);

  let state = initialState(scope, generation);
  let journal = empty;
  const firstEvent = makeReducerEvent({
    event_type: "INTENT_RECEIVED",
    scope,
    controller_generation: generation,
    expected_revision: 0,
    payload: { raw_text_sha256: "raw" },
  });
  const first = reduce(state, firstEvent);
  journal = appendJournalEvent(journal, {
    event_type: firstEvent.event_type,
    scope,
    controller_generation: generation,
    idempotency_key: firstEvent.idempotency_key,
    payload: firstEvent.payload,
    state_before: state,
    state_after: first.state,
    timestamp_measured: "2026-08-15T10:00:00-04:00",
  });
  state = first.state;

  const secondEvent = makeReducerEvent({
    event_type: "INTENT_VERIFIED",
    scope,
    controller_generation: generation,
    expected_revision: state.revision,
    payload: { verified: true },
  });
  const second = reduce(state, secondEvent);
  journal = appendJournalEvent(journal, {
    event_type: secondEvent.event_type,
    scope,
    controller_generation: generation,
    idempotency_key: secondEvent.idempotency_key,
    payload: secondEvent.payload,
    state_before: state,
    state_after: second.state,
    timestamp_measured: "2026-08-15T10:00:01-04:00",
  });

  assert.equal(journal.revision, 2);
  assert.equal(journal.events[1].sequence, 2);
  assert.equal(journal.events[1].prior_event_sha256, journal.events[0].event_sha256);
  assert.equal(verifyJournal(journal).valid, true);
  assert.match(journalSha256(journal), /^[0-9a-f]{64}$/u);

  const snapshot = createSnapshot({
    revision: journal.revision,
    last_event_sha256: journal.events[1].event_sha256,
    state: second.state,
  });
  assert.equal(verifySnapshot(snapshot, journal, second.state).valid, true);
  assert.deepEqual(snapshot, createSnapshot({
    revision: journal.revision,
    last_event_sha256: journal.events[1].event_sha256,
    state: second.state,
  }));
});

test("journal rejects non-monotonic append and detects postimage tampering", () => {
  const journal = appendJournalEvent(emptyJournal(), {
    event_type: "INTENT_RECEIVED",
    scope,
    controller_generation: generation,
    idempotency_key: "journal-key",
    payload: {},
    state_before: { revision: 0 },
    state_after: { revision: 1 },
    timestamp_measured: "2026-08-15T10:00:00-04:00",
  });
  assert.throws(
    () => appendJournalEvent(journal, {
      event_type: "INTENT_VERIFIED",
      scope,
      controller_generation: generation,
      idempotency_key: "journal-key-2",
      payload: {},
      state_before: { revision: 1 },
      state_after: { revision: 2 },
      timestamp_measured: "2026-08-15T10:00:01-04:00",
      revision: 3,
    }),
    (error: unknown) => error instanceof JournalError && error.code === "REVISION_MISMATCH",
  );

  const tampered = {
    ...journal,
    events: [{ ...journal.events[0], state_after_sha256: "0".repeat(64) }],
  } as typeof journal;
  assert.equal(verifyJournal(tampered).valid, false);
});

