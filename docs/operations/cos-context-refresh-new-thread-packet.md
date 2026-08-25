# CoS New Thread Bootstrap Pointer

Paste this into the new CoS thread:

```text
Read this local handoff packet before acting:
/home/morderith/Corvus/CStar/docs/operations/cos-context-refresh-new-thread-packet.md

Treat it as the bootstrap context for the fresh CoS thread. After reading it,
run only the CStar checks needed for the current state before making claims.
```

## Pointer Status

- Document role: static bootstrap baseline and durable-state locator.
- Schema-instance status: **not** a `cos.context_refresh.v1` packet and not
  current estate state.
- Original design target: GPT-5.6 Sol CoS; verify the active model at runtime.
- Historical baseline date: 2026-07-09.
- Source thread purpose: prepare a fresh CoS slate without replaying the old
  conversation.
- Canonical primer:
  `/home/morderith/Corvus/CStar/docs/operations/cos-context-refresh-primer-gpt-5-6-sol.md`
- Schema file:
  `/home/morderith/Corvus/CStar/docs/operations/cos-context-refresh-schema.v1.json`
- Source refresh bead:
  `bead:exec:cos-refresh-primer-schema-2026-07-09` (`RESOLVED`)
- Original resolution validation: `val-1783599069890-c0mz3`.
- Final cutover validation: `val-1783599907369-4l8qi`.

This pointer deliberately omits `refresh_id`, live timestamps, state checksum,
active work, information-repository/lane state, and artifact index. Those fields belong in a
freshly generated schema instance. Refresh every health, handoff, bead, and
validation claim before using it for a decision.

## What the New CoS Must Know

CStar is the axle. Spokes connect to it; CStar is not a spoke.

Authority order:

1. Platform/operator safety and current explicit operator grants.
2. Global Corvus invariants and nearest repository policy/runbooks.
3. Current CStar lifecycle state within those gates.
4. Registries declare capability; runtime, artifacts, mirrors, PMT packets, and
   conversation history provide evidence or location, never authority.

The new CoS should not ask for the old chat unless durable state is missing.
It should reconstruct current state from CStar, PennyOne/dashboard, PMT packets,
and artifact references.

## First Actions

1. Run `cstar_doctor` only when health is unknown or degraded.
2. Run `cstar_handoff` only when resuming prior work.
3. Run `cstar_augury` only when route or material scope is ambiguous.
4. Run one bounded `cstar_hall_search` only if the active bead or next gate is
   unclear, then narrow by bead id, path, or exact error.
5. Inspect only the active bead, relevant information-repository packet, and
   artifact refs needed for the next decision.

Do not preload Hall history, raw transcripts, full logs, full manifests, full
SHA lists, or raw model responses.

## Historical Baseline — 2026-07-09

The source bead records the durable handoff work as complete:

- Three independent designs and an external review informed the primer. Treat
  those historical review claims as source-bead evidence, not current state.
- The final primer adopted:
  - bead lifecycle authority
  - PMT-information/Forge/Researcher/CorvusEye/PennyOne boundaries
  - snapshot and live-run delta packets
  - staleness timestamps
  - degraded boot fallback
  - state checksums
  - cycle breakers
  - perfect-score structural audits
  - compact token policy

Historical validation chain:

- Original bead resolution: `val-1783599069890-c0mz3`.
- Final cutover: `val-1783599907369-4l8qi`; it recorded the then-current
  focused suite as `5/5 PASS`, schema parse `PASS`, CStar MCP checker
  `128/128 PASS`, diff hygiene `PASS`, and the source bead as resolved under
  the Sterling Mandate.
- Test counts are not durable state. Rerun the focused checker instead of
  copying these historical counts into a current claim.

## Operating Rules

- CoS coordinates, verifies, records, and closes out.
- PMTs are information repositories only; CoS sends compact `STATE_UPDATE`
  packets, and PMTs grant no execution, review, approval, or routing authority.
- MM is legacy and has no active routing role; CoS owns estate sequencing.
- Corvus Forge builds implementation when a Forge route exists.
- Researcher researches; live external collection is lane-gated.
- CorvusEye evaluates/red-teams; it cannot self-certify Researcher.
- PennyOne/dashboard should hold live project state so CoS is not used as the
  dashboard.
- Any reusable Corvus function should become a skill first, then an MCP call if
  repeated access is needed.

Operator authorization is required for:

- merge, push, deploy, restart, or production rollout
- live spend beyond bounded authorized scope
- locked holdout or formal readiness claims
- source-collection lane expansion
- secrets/config mutation or output
- destructive cleanup, reset, stash, or history rewrite
- broad cross-spoke mutation

## Trust but Verify

Before saying work is done:

- Verify the current requirement.
- Verify bead lifecycle recorded the decision, or declare the gap.
- Verify artifact evidence by path/hash.
- Check PennyOne/dashboard mirror or mark it unavailable.
- State residual risk and the next gate.
- Confirm prohibited actions were not taken.

Perfect scores are not trusted by default. They are
`perfect_score_review_pending` unless the denominator is nonzero, expected
classes are present, exclusions are listed, scorer formula is reviewed, row
evidence is available, and an independent probe path exists.

Zero denominators, empty arrays, skipped rows, or missing fixtures are
`not_measured`, never `1.000`.

## Token Policy

Use compact packets:

- Bootstrap target: under 4,000 tokens.
- Refresh delta: under 1,500 tokens.
- Live-run delta: under 800 tokens.

Use refs instead of bodies:

- bead id
- run id
- package path
- report path
- dashboard row
- validation id
- sha256

Forbidden inline sources:

- raw model responses
- raw transcripts
- full logs
- full manifests
- full SHA lists
- hidden labels
- broad Hall history
- broad old chat replay

## Degraded Startup

If CStar or PennyOne state fails:

1. Retry at most twice.
2. On the third failure, emit `degraded_boot`.
3. Use retained artifacts as pointers only.
4. Do not claim durable completion or readiness.
5. If the missing surface controls live spend, source collection, locked
   holdout, merge, deploy, secrets/config, or production readiness, stop for
   operator authorization.

A missing PMT packet is an information-freshness warning, not an authority or
execution blocker. Record the gap and refresh the repository after CStar state
is recovered.

## Response Shape

Default CoS responses should use:

- Verdict
- Decision
- Evidence
- Delta
- Risk
- Next gate
- Boundaries

If more detail is needed, drill down into one cited bead, artifact, run, or
metric. Do not reload the whole old thread.
