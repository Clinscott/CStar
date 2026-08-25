import {
  canonicalSha256,
  hashOmittingField,
  isPlainJsonObject,
  withSelfHash,
} from "./canonical.js";

export const JOURNAL_SCHEMA = "corvus.journal_state.v0" as const;
export const JOURNAL_EVENT_SCHEMA = "corvus.journal_event.v1" as const;
export const SNAPSHOT_SCHEMA = "corvus.snapshot.v1" as const;
export const REDUCER_VERSION = "corvus.organism.reducer.v0" as const;

export interface JournalState {
  readonly schema: typeof JOURNAL_SCHEMA;
  readonly revision: number;
  readonly events: readonly JournalEvent[];
}

export interface JournalEvent {
  readonly schema: typeof JOURNAL_EVENT_SCHEMA;
  readonly revision: number;
  readonly sequence: number;
  readonly event_type: string;
  readonly scope: string;
  readonly controller_generation: string;
  readonly prior_event_sha256: string | null;
  readonly state_before_sha256: string;
  readonly state_after_sha256: string;
  readonly effect_id: string | null;
  readonly idempotency_key: string;
  readonly payload_sha256: string;
  readonly timestamp_measured: string;
  readonly event_sha256: string;
}

export interface JournalEventInput {
  readonly event_type: string;
  readonly scope: string;
  readonly controller_generation: string;
  readonly idempotency_key: string;
  readonly payload: unknown;
  readonly state_before: unknown;
  readonly state_after: unknown;
  readonly timestamp_measured: string;
  readonly effect_id?: string | null;
  readonly revision?: number;
  readonly sequence?: number;
}

export interface JournalSnapshot {
  readonly schema: typeof SNAPSHOT_SCHEMA;
  readonly revision: number;
  readonly last_event_sha256: string | null;
  readonly reducer_version: typeof REDUCER_VERSION;
  readonly state_sha256: string;
  readonly outbox_sha256: string;
  readonly inbox_sha256: string;
  readonly snapshot_sha256: string;
}

export interface SnapshotInput {
  readonly revision: number;
  readonly last_event_sha256: string | null;
  readonly state: unknown;
  readonly outbox?: unknown;
  readonly inbox?: unknown;
}

export interface JournalVerificationResult {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

export class JournalError extends Error {
  readonly code: "INVALID_JOURNAL" | "INVALID_EVENT" | "REVISION_MISMATCH" | "SEQUENCE_MISMATCH";

  constructor(
    code: JournalError["code"],
    message: string,
  ) {
    super(message);
    this.name = "JournalError";
    this.code = code;
  }
}

const JOURNAL_KEYS = ["schema", "revision", "events"];
const EVENT_KEYS = [
  "schema",
  "revision",
  "sequence",
  "event_type",
  "scope",
  "controller_generation",
  "prior_event_sha256",
  "state_before_sha256",
  "state_after_sha256",
  "effect_id",
  "idempotency_key",
  "payload_sha256",
  "timestamp_measured",
  "event_sha256",
];
const SNAPSHOT_KEYS = [
  "schema",
  "revision",
  "last_event_sha256",
  "reducer_version",
  "state_sha256",
  "outbox_sha256",
  "inbox_sha256",
  "snapshot_sha256",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return isPlainJsonObject(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hashString(value: unknown): boolean {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function cloneJournal(journal: JournalState): JournalState {
  return { ...journal, events: [...journal.events] };
}

export function emptyJournal(): JournalState {
  return { schema: JOURNAL_SCHEMA, revision: 0, events: [] };
}

export const createEmptyJournal = emptyJournal;
export const initialJournal = emptyJournal;

function validateJournalShape(journal: unknown): asserts journal is JournalState {
  if (!isRecord(journal)
    || !hasExactKeys(journal, JOURNAL_KEYS)
    || journal.schema !== JOURNAL_SCHEMA
    || !Number.isSafeInteger(journal.revision)
    || journal.revision < 0
    || !Array.isArray(journal.events)) {
    throw new JournalError("INVALID_JOURNAL", "Journal shape is malformed");
  }
}

function createEventBase(journal: JournalState, input: JournalEventInput): JournalEvent {
  const revision = journal.revision + 1;
  const sequence = journal.events.length + 1;
  if (input.revision !== undefined && input.revision !== revision) {
    throw new JournalError("REVISION_MISMATCH", "Journal event revision is not monotonic");
  }
  if (input.sequence !== undefined && input.sequence !== sequence) {
    throw new JournalError("SEQUENCE_MISMATCH", "Journal event sequence is not monotonic");
  }
  if (!nonEmptyString(input.event_type)
    || !nonEmptyString(input.scope)
    || !nonEmptyString(input.controller_generation)
    || !nonEmptyString(input.idempotency_key)
    || !nonEmptyString(input.timestamp_measured)) {
    throw new JournalError("INVALID_EVENT", "Journal event has a missing typed field");
  }
  let payloadSha256: string;
  let stateBeforeSha256: string;
  let stateAfterSha256: string;
  try {
    payloadSha256 = canonicalSha256(input.payload);
    stateBeforeSha256 = canonicalSha256(input.state_before);
    stateAfterSha256 = canonicalSha256(input.state_after);
  } catch (error) {
    throw new JournalError(
      "INVALID_EVENT",
      `Journal event value is not canonical JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const previous = journal.events[journal.events.length - 1];
  const eventWithoutHash = {
    schema: JOURNAL_EVENT_SCHEMA,
    revision,
    sequence,
    event_type: input.event_type,
    scope: input.scope,
    controller_generation: input.controller_generation,
    prior_event_sha256: previous?.event_sha256 ?? null,
    state_before_sha256: stateBeforeSha256,
    state_after_sha256: stateAfterSha256,
    effect_id: input.effect_id ?? null,
    idempotency_key: input.idempotency_key,
    payload_sha256: payloadSha256,
    timestamp_measured: input.timestamp_measured,
  };
  return withSelfHash(eventWithoutHash, "event_sha256") as JournalEvent;
}

/** Append one immutable event and return a new journal value. */
export function appendJournalEvent(journal: JournalState, input: JournalEventInput): JournalState {
  validateJournalShape(journal);
  const checked = verifyJournal(journal);
  if (!checked.valid) {
    throw new JournalError("INVALID_JOURNAL", checked.issues.join("; "));
  }
  const event = createEventBase(journal, input);
  return {
    ...cloneJournal(journal),
    revision: event.revision,
    events: [...journal.events, event],
  };
}

export const appendEvent = appendJournalEvent;

export function verifyJournal(journal: unknown): JournalVerificationResult {
  const issues: string[] = [];
  if (!isRecord(journal) || !hasExactKeys(journal, JOURNAL_KEYS) || journal.schema !== JOURNAL_SCHEMA) {
    return { valid: false, issues: ["journal: invalid closed shape"] };
  }
  if (!Number.isSafeInteger(journal.revision) || journal.revision < 0 || !Array.isArray(journal.events)) {
    return { valid: false, issues: ["journal: invalid revision or events"] };
  }
  if (journal.revision !== journal.events.length) {
    issues.push("journal.revision: does not equal event count");
  }
  let prior: string | null = null;
  journal.events.forEach((event, index) => {
    if (!isRecord(event) || !hasExactKeys(event, EVENT_KEYS) || event.schema !== JOURNAL_EVENT_SCHEMA) {
      issues.push(`events[${index}]: invalid closed shape`);
      return;
    }
    const expectedRevision = index + 1;
    if (event.revision !== expectedRevision) {
      issues.push(`events[${index}].revision: expected ${expectedRevision}`);
    }
    if (event.sequence !== expectedRevision) {
      issues.push(`events[${index}].sequence: expected ${expectedRevision}`);
    }
    if (event.prior_event_sha256 !== prior) {
      issues.push(`events[${index}].prior_event_sha256: broken hash link`);
    }
    if (!hashString(event.state_before_sha256)
      || !hashString(event.state_after_sha256)
      || !hashString(event.payload_sha256)
      || !hashString(event.event_sha256)
      || !nonEmptyString(event.event_type)
      || !nonEmptyString(event.scope)
      || !nonEmptyString(event.controller_generation)
      || !nonEmptyString(event.idempotency_key)
      || !nonEmptyString(event.timestamp_measured)
      || (event.effect_id !== null && !nonEmptyString(event.effect_id))) {
      issues.push(`events[${index}]: invalid typed field`);
    }
    try {
      if (event.event_sha256 !== hashOmittingField(event, "event_sha256")) {
        issues.push(`events[${index}].event_sha256: self-hash mismatch`);
      }
    } catch {
      issues.push(`events[${index}].event_sha256: cannot hash event`);
    }
    prior = typeof event.event_sha256 === "string" ? event.event_sha256 : null;
  });
  return { valid: issues.length === 0, issues };
}

export function createSnapshot(input: SnapshotInput): JournalSnapshot {
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
    throw new TypeError("Snapshot revision must be a non-negative safe integer");
  }
  if (input.last_event_sha256 !== null && !hashString(input.last_event_sha256)) {
    throw new TypeError("Snapshot last event hash must be a SHA-256 value or null");
  }
  const base = {
    schema: SNAPSHOT_SCHEMA,
    revision: input.revision,
    last_event_sha256: input.last_event_sha256,
    reducer_version: REDUCER_VERSION,
    state_sha256: canonicalSha256(input.state),
    outbox_sha256: canonicalSha256(input.outbox ?? []),
    inbox_sha256: canonicalSha256(input.inbox ?? []),
  };
  return withSelfHash(base, "snapshot_sha256") as JournalSnapshot;
}

export const snapshotJournal = createSnapshot;

export function verifySnapshot(
  snapshot: unknown,
  journal: JournalState,
  state?: unknown,
  outbox?: unknown,
  inbox?: unknown,
): JournalVerificationResult {
  const issues: string[] = [];
  if (!isRecord(snapshot) || !hasExactKeys(snapshot, SNAPSHOT_KEYS) || snapshot.schema !== SNAPSHOT_SCHEMA) {
    return { valid: false, issues: ["snapshot: invalid closed shape"] };
  }
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision !== journal.revision) {
    issues.push("snapshot.revision: does not match journal");
  }
  const last = journal.events[journal.events.length - 1]?.event_sha256 ?? null;
  if (snapshot.last_event_sha256 !== last) {
    issues.push("snapshot.last_event_sha256: does not match journal tail");
  }
  if (snapshot.reducer_version !== REDUCER_VERSION) {
    issues.push("snapshot.reducer_version: unsupported reducer version");
  }
  try {
    if (snapshot.snapshot_sha256 !== hashOmittingField(snapshot, "snapshot_sha256")) {
      issues.push("snapshot.snapshot_sha256: self-hash mismatch");
    }
  } catch {
    issues.push("snapshot.snapshot_sha256: cannot hash snapshot");
  }
  if (state !== undefined && snapshot.state_sha256 !== canonicalSha256(state)) {
    issues.push("snapshot.state_sha256: state mismatch");
  }
  if (outbox !== undefined && snapshot.outbox_sha256 !== canonicalSha256(outbox)) {
    issues.push("snapshot.outbox_sha256: outbox mismatch");
  }
  if (inbox !== undefined && snapshot.inbox_sha256 !== canonicalSha256(inbox)) {
    issues.push("snapshot.inbox_sha256: inbox mismatch");
  }
  return { valid: issues.length === 0, issues };
}

export function journalSha256(journal: JournalState): string {
  const result = verifyJournal(journal);
  if (!result.valid) {
    throw new JournalError("INVALID_JOURNAL", result.issues.join("; "));
  }
  return canonicalSha256(journal);
}

export const hashJournal = journalSha256;

