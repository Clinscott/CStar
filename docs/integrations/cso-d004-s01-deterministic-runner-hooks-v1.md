# CSO-D004-SET-01: deterministic runner hooks v1

This document is the Lore for the S01 contract. It is frozen with the source
schema, focused unit test, feature contract, and offline integration test by
the implementation receipt. The reducer is a local deterministic state machine
and is not a provider adapter or a lifecycle authority outside CStar.

## Binding

- Contract: cso-d004-s01-deterministic-runner-hooks-v1
- Schema version: cso-d004-s01.schema.v1
- Reducer version: cso-d004-s01.reducer.v1
- Encoding: UTF-8
- Canonical form: schema-declared field order, compact JSON, no whitespace,
  SHA-256 over UTF-8 bytes
- Requested selector: gpt-5.6-luna
- Requested reasoning: max
- Actual identity: unreported unless a host attestation is present
- Retry default and maximum: 0
- Forge policy: permanently tombstoned; no route is exposed

The bounded receipt records the final SHA-256 and byte/line binding for this
Lore, the TypeScript schema, the feature, and both tests. It also records the
canonical contract and manifest hashes. A receipt is evidence of this package;
it does not declare lifecycle acceptance, production readiness, or delivery
validation.

## Canonical schemas

Every record is an exact field set. Missing and additional fields fail
SCHEMA_INVALID. Serialization walks the field list in the declared order,
serializes arrays in source order, emits compact JSON, and hashes the resulting
UTF-8 byte sequence. Generic payloads use sorted object keys but are stored only
as payload_sha256, so an opaque payload cannot change the schema.

The frozen schemas are:

- request: contract binding, task and scope, expected_revision,
  requested_model_selector, requested_reasoning, actual_identity,
  actual_identity_attestation_sha256, retry_budget, and retry_count.
- effect_derivation and effect_intent: task/effect sequence, payload hash,
  stable effect_id, stable idempotency_key, CAS revision, and retry count.
- journal: append-only transition sequence, revision, phases, operation, effect
  identity, and event hash.
- snapshot: task, revision, phase, next effect, journal/outbox/inbox/metrics
  hashes, and state hash.
- outbox: effect identity, sequence/effect, payload hash, status, and revision
  bounds.
- inbox and ack: effect identity, ACK/FAILURE/UNKNOWN result, acknowledgement
  identity, observed revision, response hash, and receipt revision.
- terminal and validation: terminal reason/hash and validator identity,
  validator kind, result, evidence hash, and validation revision.
- recovery: effect identity, exact crash boundary, observed status, action,
  required operator decision, recovery hash, and revision.
- metrics and checkpoint: measurable counters and cross-record hash bindings.

## Closed effect order and phases

The only six transport effects, in one order, are:

| Sequence | Effect | From | Pending | ACK |
| ---: | --- | --- | --- | --- |
| 0 | TASK_CREATE | PLANNED | CREATE_PENDING | CREATED |
| 1 | TASK_RESUME | CREATED | RESUME_PENDING | RESUMED |
| 2 | TASK_FORK | RESUMED | FORK_PENDING | FORKED |
| 3 | TASK_SEND | FORKED | SEND_PENDING | SENT |
| 4 | TASK_WAIT | SENT | WAIT_PENDING | WAITED |
| 5 | TASK_READ | WAITED | READ_PENDING | READ |

After READ, the only legal domain transitions are TERMINAL, then VALIDATED
after a validation record. REJECTED is terminal for a transport failure or a
failed validation. UNKNOWN and RECOVERY are closed hold states. RECOVERY never
queues a replacement effect automatically.

## CAS, identity, and idempotency

Every mutating reducer call supplies expected_revision. A successful call
increments revision exactly once and records last_cas_expected_revision. A
stale call returns CAS_MISMATCH without changing the state.

The derivation input is exactly:

    contract_id, task_id, sequence, effect, payload_sha256

The digest of that canonical record yields effect:<digest> and idem:<digest>.
Requested model selector, requested reasoning, actual identity, transcript text,
wall time, random values, and provider output are not derivation inputs. A
persisted inbox result with the same result hash is IDEMPOTENT_REPLAY. A changed
result or idempotency key is IDEMPOTENCY_CONFLICT.

## Crash, failure, and recovery rules

The exact crash boundaries are before_outbox_append,
after_outbox_append_before_transport, during_transport,
after_transport_before_ack_persist, after_ack_persist_before_snapshot, and
during_recovery. If a post-effect result is uncertain at any boundary, the
state is UNKNOWN, the outbox is UNKNOWN, an UNKNOWN inbox record and recovery
record are written, and no retry or replay is permitted. The operator must
reconcile through the recovery record before any later lifecycle work.

Typed failure codes include SCHEMA_INVALID, CAS_MISMATCH,
EFFECT_ORDER_VIOLATION, INVALID_PHASE_TRANSITION, IDEMPOTENCY_CONFLICT,
DUPLICATE_EXTERNAL_EFFECT_FORBIDDEN, UNKNOWN_POST_EFFECT, RECOVERY_REQUIRED,
RETRY_FORBIDDEN, TERMINAL_REQUIRED, VALIDATION_REQUIRED, and
TRANSPORT_REJECTED. The authority-negative codes reject Forge reachability,
model-selected lifecycle, transcript authority, polling, and silent retry.

## Negative proofs and counters

The reducer does not execute a transport callback. It only creates an outbox
intent and records a typed result. Therefore offline tests keep
external_effects_executed at zero while still measuring effects_planned and
effects_acknowledged. The following negative proof counters must remain zero:

    forge_reachability
    model_selected_lifecycle
    transcript_authority
    polling
    silent_retries
    duplicate_external_effects

The metrics schema additionally exposes unknown, failed, duplicate intent, CAS,
terminal, validation, and recovery counters. Protected provider, spend,
network, Forge, Git, install, activation, restart, deploy, secrets, and
destructive counters are package-level zero assertions in the receipt and
offline integration test. Tests use no providers, network, credentials, or
external state.

## Validation boundary

The focused unit test proves canonical field order and UTF-8, CAS and revision,
effect order and idempotency, all six effects, UNKNOWN recovery, identity
separation, retry zero, negative proofs, and counters. The integration test
replays the complete six-effect fixture twice and compares state/checkpoint
hashes. These are deterministic local checks only. They do not call a CStar
provider surface, activate or restart anything, publish Git state, or declare
lifecycle acceptance.
