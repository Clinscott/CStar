# CSO-D004 / CSO-D003 terminal-observation adapter v1

This Lore records the source-only host adapter for the frozen
`corvus.task_control.terminal_observation.v1` design. It is a transport
receipt surface, not CStar lifecycle authority. Forge remains
`TOMBSTONED_PERMANENT`.

## Binding

- Plan: `PLAN.v2`
- Requested selector: `gpt-5.6-luna`
- Requested reasoning: `max`
- Actual identity: `unreported` unless a host attestation is present
- Retry, replay, replacement, fallback, duplicate dispatch, descendants, and peer messages: `0`
- Mutable source: the six-path CSO-D004/D003 allowlist only

The accepted S01 reducer remains unchanged. Its effect order is exactly:

`TASK_CREATE -> TASK_RESUME -> TASK_FORK -> TASK_SEND -> TASK_WAIT -> TASK_READ`

The adapter consumes existing effect intents and returns existing typed
transport results. Only an ACKed `TASK_READ` can move the reducer to `READ`.
The transport ACK is not candidate, experiment, validation, or lifecycle
acceptance; independent validation and `cstar_record_result` remain required.

## Degraded host protocol

`TASK_SEND` performs exactly one native send. The ACK binds request, target,
returned thread and turn, idempotency, canonical cwd, message bytes and hash,
requested selector and reasoning, actual identity and attestation, host, wall
times, monotonic ACK time, result projection, and receipt hash. A missing or
target-conflicting ACK is `TRANSPORT_REJECTED`. An ambiguous post-send result is
`UNKNOWN_POST_EFFECT`; no second send is permitted.

`TASK_WAIT` performs no host wait call. It persists a compact, hash-bound
schedule:

| Field | Value |
| --- | ---: |
| `hard_lease_ms` | `1200000` |
| `observation_1_offset_ms` | `1080000` |
| `observation_2_offset_ms` | `1200000` |
| `observation_grace_ms` | `30000` |
| `max_direct_reads` | `2` |
| native wait calls | `0` |
| interval polling calls | `0` |

Due and close times use `send_ack_monotonic_ms`; wall time is observation data
only. The schedule core has the frozen field order and compact UTF-8 JSON
serialization. Its ID is `observation:<sha256(core)>`; the ACK ID is
`wait-schedule:<same digest>`.

`TASK_READ` makes one direct structured read in its exact window. A known
nonterminal or unavailable observation without identity conflict admits only
the second predetermined window. A valid structured terminal packet ACKs the
read. Malformed, conflicting, transcript-only, or mistimed evidence freezes
`UNKNOWN`. An inconclusive second window uses
`TERMINAL_OBSERVATION_EXHAUSTED`, grants zero credit, and permits no further
read or inferred completion.

Every observation row has the frozen 28-field shape, including target and turn
identity, monotonic timing, window result, host cursor status, projection and
receipt hashes, deterministic cursor before/after, `transcript_included: false`,
terminal packet hash, and typed failure subcode. The host cursor is recorded or
typed `unavailable`; the adapter never invents a provider cursor. Reuse or
mutation is `OBSERVATION_CURSOR_CONFLICT`.

Terminal packets bind the same task, root, effect, schedule, thread, originating
turn, requested selector and reasoning, actual identity and attestation,
outcome, structured result hash, artifacts hash, tests hash, terminal manifest
hash, and protected-effect counter. Accepted packet outcomes are
`DELIVERED_UNVERIFIED`, `REJECTED`, and `UNKNOWN`; only the first can proceed to
independent validation.

## Evidence and checks

The focused unit suite has 24 tests. It covers manifest binding, effect order,
schedule derivation, zero wait/poll calls, send identity and ambiguity,
identity conflicts, both timing windows, cursor conflicts, first/second terminal
reads, malformed and inconclusive reads, structured-result absence, transcript
rejection, direct-read limit, duplicate dispatch, polling rejection, UNKNOWN
zero-credit behavior, and requested/actual identity separation.

The focused integration suite has 6 tests. It covers the absent wait handler,
one- and two-read terminal paths, no wait invocation, exhausted UNKNOWN,
offline rehydration without a read or effect, and PLAN.v2/D003 binding.

Focused checks are local and offline. They do not invoke providers, network,
ENM E01, Forge, Git, installation, activation, restart, deployment, secrets,
configuration, or destructive effects.

