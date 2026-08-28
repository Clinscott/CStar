# CStarCore v1 transition contract

Status: proposed, non-authoritative, and inactive. Tracks #45. Depends on #50 and the authority boundary proposed in Clinscott/Corvus#5.

## Boundary

CStarCore is one pure calculation: `reduce(prior_state, event) -> transition_result`. It returns candidate data or a stable structural rejection. It never admits an event, records authoritative state, reserves or performs an effect, checks whether an authority generation is current, or decides whether work succeeded.

Organism remains the sole authority for generation status, admission, idempotency, cancellation decisions, protected gates, authoritative revision, journal append, effect reservation, and terminal receipts. The event carries those bindings as explicit opaque input so reduction has no ambient clock, randomness, filesystem, database, network, process, credential, provider, Git, UI, or global mutable state.

## One lifecycle

```text
construct -> submit -> observe -> dispose
       \----------------------> dispose
```

The shortcut is pre-submission abandonment: `constructed + dispose -> disposed`. Once submitted, the lifecycle must be observed before disposal. Cancellation is the observation outcome `cancelled`; it is not a command, authority decision, side effect, or fifth state.

| Prior state | Event | Next phase | Returned effect intents |
| --- | --- | --- | --- |
| no state | `construct` | `constructed`, revision 0 | `[]` |
| `constructed` | `submit` | `submitted`, revision +1 | exact inert declarations from the event |
| `submitted` | `observe` | `observed`, revision +1 | `[]` |
| `observed` | `dispose` | `disposed`, revision +1 | `[]` |
| `constructed` | `dispose` | `disposed`, revision +1 | `[]` |

Every unlisted pair returns `CSTAR_INVALID_TRANSITION` and retains the prior state byte-for-byte. A disposed lifecycle is terminal.

Observation outcomes are exactly `delivered_unverified`, `failed`, `cancelled`, and `unknown`. There is deliberately no `success`, `approved`, `authorized`, `running`, or `resolved` core state.

## Closed data model

The checked-in schema is the normative field definition. Every object is closed. Protocol identifiers are bounded printable ASCII; hashes are lowercase SHA-256; numbers are nonnegative JSON-safe integers (`0...9007199254740991`).

The event envelope has exactly the cross-repository fields frozen by Corvus #5:

```text
schema_id, schema_version, policy_hash, reducer_hash, journal_binding_hash,
scope, authority_generation, prior_revision, event_id, idempotency_key,
event_type, payload, logical_time, operator_decision, validation_evidence
```

Payloads are event-specific and closed:

| Event | Payload |
| --- | --- |
| `construct` | `lifecycle_id`, `definition_hash` |
| `submit` | ordered `effect_intents` |
| `observe` | `submission_hash`, outcome, `evidence_hash` |
| `dispose` | `disposal_hash` |

An effect intent has exactly `intent_id`, `effect_type`, `capability`, and `payload_hash`. In v1, `effect_type` is only `capability_request`. It is inert data. Closed objects make provider routes, shell commands, URLs, and physical paths structurally impossible.

A transition result contains exactly one of:

- a candidate with `prior_state_hash`, `candidate_state`, `candidate_state_hash`, `effect_intents`, and `replay_token`; or
- a rejection with `code`, fixed `message`, `event_id`, and `prior_revision`.

The replay token is SHA-256 over canonical bytes of `{candidate_state_hash, effect_intents_hash, event_hash, prior_state_hash}`. It proves deterministic calculation only; it is not admission, permission, or an idempotency record.

## Stable reducer failures

Apply checks in this order so one input has one failure:

1. schema support and closed-shape validation;
2. required or already-existing state;
3. event type;
4. envelope binding equality;
5. structural revision equality;
6. logical-time monotonicity;
7. event-specific payload validity;
8. legal transition;
9. observation-to-submission hash binding.

| Code | Fixed meaning |
| --- | --- |
| `CSTAR_SCHEMA_UNSUPPORTED` | unsupported state, event, or result schema |
| `CSTAR_STATE_REQUIRED` | a non-construct event has no state |
| `CSTAR_STATE_ALREADY_EXISTS` | construct has an existing state |
| `CSTAR_EVENT_TYPE_UNSUPPORTED` | unknown event type |
| `CSTAR_ENVELOPE_BINDING_MISMATCH` | scope or opaque bindings changed |
| `CSTAR_REVISION_MISMATCH` | event revision differs from state revision |
| `CSTAR_LOGICAL_TIME_REGRESSION` | event time precedes state time |
| `CSTAR_PAYLOAD_INVALID` | the event-specific payload is malformed |
| `CSTAR_SUBMISSION_HASH_MISMATCH` | observation does not bind to submitted intents |
| `CSTAR_INVALID_TRANSITION` | the event is illegal from the current phase |

Messages are fixed constants and never interpolate payloads, providers, paths, or host data.

## Organism preflight and replay

Organism runs authoritative gates before CStarCore. Stale, revoked, or unknown generations; authoritative revision mismatches; event-ID conflicts; and idempotency conflicts return `ORGANISM_*` outcomes without calling the reducer. Exact idempotency replay returns the previously journaled result bytes without calling the reducer, appending the journal, or reserving an effect again.

CStarCore's binding and revision checks are structural fail-closed checks if an invalid pair reaches it. They do not determine generation status or authoritative journal position.

The golden-vector file separates reducer scenarios from Organism boundary scenarios. Its cancellation scenario uses `observe(cancelled)` with explicit decision and evidence hashes. Literal canonical result strings and hashes are checked in; an implementation must consume them rather than regenerate its expectations.

## Canonical bytes

- compact JSON;
- object keys sorted recursively by UTF-16 code unit;
- array order preserved;
- explicit nulls retained;
- UTF-8 bytes;
- exactly one final LF;
- lowercase SHA-256 over all bytes, including that LF.

Pretty Markdown, schema, and vector formatting is not protocol canonicalization.

## Legacy disposition (non-normative)

No legacy record is automatically migrated by this contract. A later one-purpose importer may project operator-approved historical records into these semantics; it cannot grant authority or synthesize success.

| Legacy semantics | v1 projection | Decision |
| --- | --- | --- |
| Hall `OPEN`, `SET-PENDING`, `SET` | `constructed` | map |
| Hall `IN_PROGRESS`; worker queued, leased, running | `submitted` | map |
| ready for review, resolved, delivered, Forge succeeded | `observed/delivered_unverified` | map, never success |
| blocked, needs triage, ambiguous, unknown | `observed/unknown` | map |
| failed or exhausted | `observed/failed` | map |
| cancelled or revoked | `observed/cancelled` | map |
| archived or superseded | `disposed` historical projection | map |

Provider, model, Forge, Hall, bead, SET, lease, attempt, spend, progress, persona, worker, MCP, database, route, path, shell, retry, daemon, scheduler, installer, and host-control nouns are discarded from canonical types.

## K.I.S.S. and sovereignty result

| Surface | This slice |
| --- | ---: |
| Runtime entry points | 0 |
| Processes or daemons | 0 |
| External dependencies | 0 |
| Executable source files | 0 |
| Closed schema bundles | 1 |
| Compatibility layers | 0 |
| Swift implementation | deferred to #47 |

Three files freeze one reducer, four events, four stored phases, five legal rows, one canonical profile, and plain-data conformance vectors. No package, code generator, schema library, provider, runtime, installer, compatibility facade, or live migration is added.

The smallest alternative was prose alone. It was rejected because machine-readable vectors are the minimum portable proof. A Swift implementation will use first-party source plus justified Apple SDK APIs only, build offline, and add no third-party package edge.
