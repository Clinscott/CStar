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

Authoritative validation additionally requires one of two kernel-backed
`cstar_record_result` paths:

- Forge delivery uses the exact execution receipt. CStar derives the validator
  identity from the current verified Codex request and binds a
  `cstar.validation-evidence.v2` manifest to the request, authorization,
  attempt, adapter, result artifact, bead, repository, and target-set hashes.
  The validator root thread must differ from both requester and authorizing executor.
  Callers provide only bounded artifact/check paths and hashes; they
  cannot assert their own identity or independence.
- Host-workflow validation uses a `host_validation_receipt`. The mutation is
  still made only by the canonical root CoS. CStar reads the fixed Codex session
  for the named depth-one validator subagent, verifies its parent is that CoS,
  verifies one latest completed final turn, and requires that final response to
  bind the exact independent-validation manifest digest. The manifest must
  exactly match the bead, validation id, verdict, artifacts, checks, and current
  bytes in the canonical runtime code root. Hall lookup and persistence remain
  in the separate control root. CStar then mints
  `cstar.validation-evidence.v3`; the subagent supplies evidence and receives no
  operator or mutation authority.

Both verified Hall writes consume a one-use opaque kernel proof. Generic Hall
persistence cannot mint `authority_class=verified_v2` or `verified_v3` from a
caller-authored, self-hashed manifest. V2 remains the only Forge-finalization
authority. V3 is additive host-workflow Audit authority and cannot finalize a
Forge attempt. Legacy v1 receipts remain readable history but satisfy neither
path.
