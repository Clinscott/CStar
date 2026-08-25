# CStar Iterative Development

Persona is explicit workflow state, not model inference and not authority.
Select it with `cstar_persona_set` only at a workflow boundary and read it with
`cstar_status`. An in-flight request, authorization, attempt, or validation
keeps its already sealed contract.

## O.D.I.N.

O.D.I.N. uses an iterative build-run-test-repair loop:

1. Choose the smallest useful increment inside the current bead, targets,
   actions, locks, spend, and source boundaries.
2. Route implementation through Forge unless the Forge boundary itself is the
   bounded repair target.
3. Run the narrowest relevant validation and inspect actual evidence.
4. Treat a recoverable local failure as another iteration of the same plan
   step. Repair through the owning lane and rerun the focused check.
5. Record meaningful lifecycle and validation state in CStar before expanding
   the increment.

A failed iteration is evidence, not an automatic escalation. Escalate only
when the next repair needs a new operator-gated effect or changes the execution
boundary.

## A.L.F.R.E.D.

A.L.F.R.E.D. uses a secure-harden-verify loop:

1. Identify the highest-risk boundary inside the authorized scope.
2. Reduce ambiguity, privileges, exposed material, and failure blast radius.
3. Run focused adversarial and regression checks.
4. Preserve explicit gaps rather than inferring safety or readiness.
5. Record independently supported results before closeout.

## Shared stop conditions

Neither persona grants spend, retry, source expansion, scope expansion, Git,
restart, activation, deployment, secret access, destructive action, or a
production claim. When one is required, persist the exact evidence and request
the missing grant. When a worker or external run is live, pause rather than
polling or duplicating it.
