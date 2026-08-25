# Validation Evidence Contract

Status: ACTIVE — FAIL CLOSED

Local TypeScript and Python validation constructors produce detached,
reported-only evidence objects. Their caller-supplied validator identity and
`independent_of_execution` assertion are compatibility inputs, not verified
authority. If represented in Hall, they remain `authority_class=reported`.
They do not persist Hall state and cannot substitute for `cstar_record_result`.

An `ACCEPTED` detached result requires all of the following:

- at least one evaluated validation check and no failed check;
- a nonempty independent validator identity;
- a valid SHA-256 evidence digest;
- `independent_of_execution=true`;
- an `evaluated_checks` count equal to the non-skipped check denominator;
- a positive trial denominator for any passing benchmark; and
- a positive, internally consistent sample denominator for any accepted SPRT
  verdict.

Missing or zero-denominator evidence produces `INCONCLUSIVE`, never
`ACCEPTED`. A failed check, protected-axis regression, failed benchmark, or
rejected SPRT remains `REJECTED`. Caller-provided summaries and scalar Gungnir
values cannot upgrade either verdict.

Authoritative validation additionally requires the kernel-backed
`cstar_record_result` path with the exact Forge execution receipt. CStar derives
the validator identity from the current verified Codex request, binds a
`cstar.validation-evidence.v2` manifest to the exact request, authorization,
attempt, adapter, result artifact, bead, repository, and target-set hashes, and
proves that the validator root thread differs from both the Forge requester and
authorizing executor. Callers provide only bounded artifact/check paths and
hashes; they cannot assert their own identity or independence. Legacy v1
receipts remain readable history but cannot finalize Forge or satisfy Sterling.
The verified Hall write consumes a one-use opaque kernel proof emitted by that
request-identity verification. Generic Hall persistence cannot mint
`authority_class=verified_v2` from a caller-authored, self-hashed manifest.
