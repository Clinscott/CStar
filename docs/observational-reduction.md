# Observational reduction v2

CStarCore reduces explicit facts for one caller-correlated execution. It does not decide what work to do, authorize work, classify prose, issue retries, or communicate with a host. Source code uses the Swift standard library alone.

```swift
let event = Observation(
    identity: .init(sourceID: "source", eventID: "event"),
    ingestSequence: 1,
    sourceSequence: 5,
    retainedBodyDigest: "caller-computed-retained-body-digest",
    fact: .operationFinished(operationID: "operation", outcome: .succeeded)
)
let result = reduce(state: ExecutionState(), observation: event)
// One observed operation result; unavailable start; objective outcome remains unknown.
```

## Caller boundary

The caller supplies all event, operation, artifact, and check identities, normalization version, ordering, and retained-body digests. Operation and artifact identities must already be correlated within the execution. Execution grouping, source trust, redaction, source timestamps, nonnumeric cursors, policy, and storage remain outside this package. No source report is independently verified by the reducer.

`ObservationIdentity` distinguishes a trusted source-event identity from a recorder's durable delivery identity. The latter can deduplicate replays of that delivery, but cannot establish that two independently delivered upstream events were the same occurrence. The state exposes that limitation.

The caller bounds the lifetime and size of an execution record. Unknown opaque metadata is limited to 1,024 UTF-8 bytes, with truncation retained through decoding. The caller must also bound/redact identifiers, reasons, kinds, and digest strings at its normalization boundary. A digest describes retained bytes; it does not claim custody of an unretained original.

## Identity and replay

The accepted occurrence list and separate conflict bodies are retained. An identical source event is a duplicate even when received with a different ingestion sequence. Body equality includes the supplied digest, typed fact, source sequence, normalization version, and completeness. The same identity with a changed retained body creates an explicit conflict without overwriting or adding an accepted occurrence. Equal content under distinct identities remains distinct work.

Identity conflicts also invalidate the affected projection fields: connectivity becomes conflict, and disputed lifecycle or interruption evidence becomes unknown. Retaining the accepted body does not certify its interpretation.

Accepted observations use supplied ingestion sequence for stable record order, with source ID, identity scope, and event ID as deterministic tie breaks. Sequence collisions are diagnosed. Source sequences are comparable only within one source. Arrival order alone cannot decide which of several conflicting artifact versions or connection reports is current. Unordered evidence remains uncertain.

For identical recorded inputs, state and diagnostics are deterministic. `ExecutionState.currentReducerVersion` is 2. Recorded normalization versions remain part of every observation; mixed versions are diagnosed. Codable conformance supports caller-owned recording and replay. Byte-canonical encoding, if needed, requires a caller encoder with stable key ordering.

## Factual interpretation

- Lifecycle, connectivity, outcome, and interruption are independent fields.
- Results survive missing starts. A late correlated start resolves start unavailability; a source-ordered start after a result produces a diagnostic.
- A disconnection retains the last observed execution lifecycle. A host stop or confirmed interruption ends the observed boundary without inventing a successful objective.
- An interruption request records intent only. No event causes an automatic resubmission.
- Conflicting terminal outcomes remain conflict, even when one arrived later. An unknown terminal report preserves uncertainty. Correction semantics require a separately specified source contract; no implicit last-writer-wins correction exists here.
- Operation results do not assign an execution's overall outcome. A failed generic command is not classified as a failed test.
- Check receipts retain exact subject identity and revision. A changed or unknown revision receives no passing evidence from another subject; contradictory reports for one check cannot certify a subject. Review notes have no measured-check meaning.
- Usage stays as reported samples with scope, parent, model, nullable counts, inclusive/exclusive basis, delta/cumulative basis, and completeness. No parent-plus-worker sum or mixed-model total is invented. Null usage differs from a reported zero.
- Unknown kinds, capture limitations, source gaps, identity conflicts, and unavailable interpretation are visible diagnostics. They never erase accepted facts.

## Local verification

The checked-in observational vectors run twice, with serialization/reopening after each prefix. Additional tests cover late delivery, duplicate/conflicting identity, independent equal-content operations, disconnection, interruption, terminal conflict, exact artifact/check association, inclusive and unknown usage, opaque metadata bounds, and deterministic replay. These are kernel tests, not proof of a particular host's capture, persistence, or display.

The library has no framework imports, package dependencies, clocks, generated IDs, shell entry points, networking, model calls, storage, callbacks, or authority policy. Build and test locally; GitHub is a human review ledger and has no Actions automation.
