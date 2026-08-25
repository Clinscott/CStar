# Native task control v1

This document describes the neutral, deterministic interpreter introduced by
the operating-efficiency repair. It is a source contract, not a runtime or
installation receipt.

## Authority model

Each governed scope binds one root, bead, SET, phase, logical item, partition,
goal generation, controller generation, occupant generation, work-package
hash, role-manifest hash, effective-policy hash, and previous-event hash. The
requested model selector is an input observation. Actual host identity is
separate and is `unreported` when the host does not attest it.

The manifest declares persistent role slots. A task is a replaceable occupant;
it is not a source of authority. A successor receives a fresh occupant and
controller generation and does not inherit a task identity, lease, secret,
goal, or host attestation.

## Canonical bytes

`canonicalJson` sorts object keys by code-unit order, preserves array order,
normalizes negative zero, and rejects non-finite or non-JSON values. The strict
JSON reader rejects duplicate keys and can reject unknown keys before a packet
is materialized. SHA-256 is computed over UTF-8 canonical JSON. Hash-bearing
objects exclude their own hash field before hashing.

## Policy inheritance

Root-to-leaf inheritance has one deterministic direction:

* budgets and maxima use `min`;
* allowlists use intersection;
* prohibitions and requirements use set union; and
* effect permissions use logical AND.

An attempted child widening, non-contiguous depth, or depth beyond eight fails
closed with a typed error. The effective policy hash is part of the goal
binding.

## State transitions

The state machine accepts already-bound events only. It does not call a host,
provider, model, network, filesystem, clock, random source, Hall, SQLite, or
Forge. The active lease and both generations are checked on every normal
event. A competing lease, manifest drift, scope violation, protected effect,
selector mismatch, missing native capability, or Forge invocation fences the
scope and opens the breaker.

`CANCEL` and `REVOKE` set an atomic barrier and consume the single native cancel
call. Exactly one `CANCEL_ACK`, `REVOKED`, or `UNKNOWN` terminal event is
accepted. Later starts, progress, completion, retry, replay, replacement, and
auto-continuation are rejected. Identical event bytes replay idempotently;
conflicting bytes open the breaker.

`COMPLETE` followed by `START` under the unchanged goal generation is rejected
as `CSTAR_NATIVE_TASK_GENERATION_LOOP` before dispatch eligibility and opens
the breaker. A role replacement is explicit and bounded by the manifest. It is
allowed only for `FAILED` or an allowlisted `BLOCKED` task and requires fresh
task and occupant identities.

Succession is two-phase. `SUCCESSION_PREPARE` freezes admission and binds the
active task set plus the last event hash. `SUCCESSION_COMMIT` retires the old
lease and activates one successor at incremented generations. Missing or
ambiguous bindings and implicit reacquisition fail closed.

One immutable cohort has exactly one bounded wait. `TIMEOUT` marks it frozen,
opens the breaker, and rejects all late events. Polling and repeated waits are
not part of this contract.

## Proof boundary

These source contracts establish deterministic construction behavior only. A
passing unit test is evidence for this source step; it does not establish
installation, activation, host capability, independent validation, CStar
lifecycle acceptance, or CSF-D007 completion.
