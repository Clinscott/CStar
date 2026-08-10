# Morderith dossier Council autoresearch

This directory records a bounded, site-scoped research workflow around the
immutable CStar Council protocols at commit
`5887042deefaae240db2a546f3cc9640f601e9e2`.

It is intentionally **host-native**. CStar currently exposes deterministic
Augury routing and a read-only SPRT history surface; it does not expose a
full-Council inference command, numeric Council confidence, or an autonomous
website researcher. This runner supplies those missing orchestration and
evidence contracts without changing CStar or reviving retired autonomous
surfaces.

## Runner v2

`workflow.v2.json` is the immutable policy contract. It owns the canonical nine
aspects, 19-protocol order, state transitions, gate classes, process limits,
hash rules, decision rubric, one-generation stop, and Token-Path quarantine.
`run-index.v2.json` is the content-addressed execution index: it selects exactly
one active record per aspect and classifies every earlier cumulative record as
superseded. Neither filenames nor prose select active state.

The executable surfaces are:

- `scripts/validate-run.mjs`: fail-closed active-index and Council-record preflight.
- `scripts/freeze-packet.mjs`: clean-commit, content-addressed aspect packet freeze.
- `scripts/augury-route.mjs`: pinned, clean CStar runtime attestation and bounded
  deterministic routing with an allowlisted child environment.
- `scripts/workflow-state.mjs`: locked, atomic, receipt-bound legal transitions.
- `scripts/sprt-evaluate.mjs`: exactly one blinded, seed-ordered, hash-bound
  sequential Council preference evaluation followed by mandatory pause.

The evaluator is SPRT-style only in its use of a log-likelihood ratio and
nominal stopping boundaries. The 19 Council protocols are a related panel, not
established independent Bernoulli trials, so the result is named a **bounded
Council sequential preference heuristic**. Nominal boundary parameters are not
empirical error guarantees. Ties contribute zero and are excluded from the
effective trial count; any protected-axis regression vetoes promotion.

## Invariants

- All 19 Council protocols review the same frozen aspect packet.
- Council guidance is advisory. Truth, provenance, accessibility, and explicit
  operator intent take precedence over vote count.
- No more than three coherent changes are accepted per aspect in one pass.
- Every recommendation receives a disposition and a traceable identifier.
- Token-Path remains quarantined, non-actionable, and non-steering.
- Pass 2 may validate or improve the site, but it may not modify the frozen
  runner.
- The first SPRT-style generation tests one bounded candidate and then stops.
- A completed `REJECTED` or `INCONCLUSIVE` generation is still a successful
  research run; only `ACCEPTED` candidates may be promoted.

## State machine

`baseline -> pass-1 aspects -> whole-site review -> workflow review -> runner v2 -> pass-2 aspects -> stable -> one SPRT generation -> pause`

The pass logs, synthesis ledgers, workflow review, and first generation ledger
live under `runs/`. `npm run verify:runner` exercises golden accept, reject,
inconclusive, tie, protected-veto, mutation, idempotency, secret-isolation,
active-index, and transition fixtures.
