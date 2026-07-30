# CStar Local and PR40 Reconciliation

Date: 2026-07-30
Decision: `decision:cstar-pr40-local-reconciliation-20260729`
Parent bead: `bead:cstar:pr40-local-reconciliation-20260729`

## Decision

Use the operational local continuity implementation as the architectural base.
Treat PR40 as a selective donor. Do not merge PR40 wholesale.

The independent quality scorecard rated the local candidate 7.4/10 and PR40
5.6/10. These ratings prioritize integration work; they are not acceptance
scores.

## Immutable inputs

- Local base commit:
  `2cfb57cd7722406fe527ee0103dd1255fcc5cc65`
- Local tracked-diff SHA-256:
  `367fc5b5340ad50dcf1a968422bb7ec903d03c36b4554604e88157e887275af0`
- Local untracked-file count: 50
- Local untracked-manifest SHA-256:
  `521183b2442b519b279d837ec254144cecf5a0c48bdf341bac5f216a6578fd0d`
- PR40 commit:
  `f833345dbf71bce69b5d5d3f53d19ec88e340021`
- PR40 tree:
  `ad61005cb06d572cd852d6c2ff7062c30aed4d7e`
- Common base:
  `cf3624352cdd99a5472a5830058daf01962997fc`

The conflicted control checkout at `/home/morderith/Corvus/CStar` is evidence
only and is not an integration source.

## Local behavior that remains canonical

- Operator authority remains above registries, routing, workers, and runtime
  evidence.
- Forge remains
  `request -> authorize -> execute -> independent record_result`.
- `CODE_ROOT` and `CONTROL_ROOT` remain separate and lineage-bound.
- Hermes owns OAuth credentials and profiles; CStar receives only bounded
  readiness, attempt, model-source, and result evidence.
- Forge uses the sealed `cstar-hub` MiniMax runtime without ambient `.env`,
  arbitrary script overrides, or inherited provider credentials.
- Persona selection is atomic, process-only, and grants no execution authority.
- Delivery remains unverified until an independent CStar result is recorded.
- Augury is advisory and used for genuine route ambiguity.
- PMTs remain information-only.
- The default tool catalog exposes no alternate worker execution path.

## PR40 behavior selected for integration

- Windows-safe TypeScript loader launch.
- BSD-tar release archive support and portable serialized paths.
- Awaited nested tests that previously produced incomplete results.
- Metadata-only Hermes profile intake.
- Atomic local verification artifact mechanics, after removing their authority
  claim and binding complete source bytes.
- Durable queue, idempotency, lease, heartbeat, cancellation, progress, and
  artifact concepts as a default-off transport below canonical CStar
  authority.
- Terminal-bead claim protection and forced `IN_PROGRESS` claim transitions.
- Selected Gungnir evidence-scale and registry-shape repairs.

## PR40 behavior explicitly rejected

- PR40 authority, AGENTS, One Mind, PMT-review, and mandatory-Augury topology.
- Removal or bypass of `cstar_forge_authorize`.
- Caller strings as execution authorization.
- Single-root runtime, repository `.env` loading, direct kernel launch, legacy
  TCP fallback, and restart-on-edit.
- Ambient environment inheritance or provider script overrides.
- AutoBot revival.
- Persona-driven risk or execution policy.
- Arbitrary validation verdict persistence or self-authoritative local test
  receipts.
- Automatic three-attempt provider retry.
- Worker `SUCCEEDED` without independent validation.
- Public spoke or Mongo mutation exposure.
- Force or exemption bypasses for rejected bead-resolution evidence.
- Gated-effect postinstall, workflow deletion, and unbounded test crawls.

## SET batches

1. R0 — materialize and validate the local baseline.
2. R1 — preserve canonical authority, roots, persona, outcomes, and validation.
3. R2 — preserve the sealed Forge, Hermes, and Researcher runtime boundary.
4. R3 — port reviewed cross-platform and archive fixes.
5. R4 — build a subordinate, default-off asynchronous job ledger.
6. R5 — build a non-authoritative, complete-byte verification artifact.
7. R6 — add metadata-only Hermes profile intake.
8. R7 — reconcile Gungnir and skill registry behavior.
9. R8 — complete test discovery, hardening, and independent acceptance.

R0 was independently accepted and recorded as
`validation:cstar-pr40-r0-baseline-20260730-v2`.

## Accepted increment lineage

The accepted baseline and increment commits preserved on this branch are:

- R0 baseline: `2cfb57cd7722406fe527ee0103dd1255fcc5cc65`
  (`validation:cstar-pr40-r0-baseline-20260730-v2`).
- `c7b64d8d1ed4d695b204d2cde542eeab6618c96d` — sealed Forge, Hermes,
  and Researcher runtime boundaries.
- `6d58d64032d3090a97ec75ab00f6693c2b83b39d` — authority, root,
  persona, outcome, and validation lifecycle reconciliation.
- `bd5ffb89c8de615b29d9dd35b7f8af3d4bec87da` — gated closeout and
  source-staging policy.
- `ea10eaf929ad2e6304ebd8a45710c0a2aff41d01` — distribution
  reconciliation coverage and generated artifacts.
- `0fbc90e879213a2edc1d19a5b6d09ba6ede98260` — removal of tracked
  runtime daemon artifacts.
- `5cd6190cdb48143d73970161e7919d2877a7d31d` — metadata-only Hermes
  profile intake contract.
- `e37ee3944701bd4e819f375e728a7c169edf9754` — non-authoritative,
  complete-byte repository verification evidence.
- `011187d51566ef3fdd6ba3a9347f8b38e273e547` — authority-neutral,
  default-off subordinate worker job ledger.
- `b858df660ab706ff605625068ec193c2c5f0d49d` — reviewed
  cross-platform loader, archive, and path fixes.
- `04ef762d4afaa0df8a21efec89da1eb9a85bcd3a` — canonical Gungnir
  score truth and scale.
- `78e9714bd1d553bfb9eec126998eb83e4406c6d9` — compatibility-only
  Gungnir calculus and registry integration.
- `7c34a84d` — fail-closed contract alignment and sealed Forge entrypoint
  support extraction.

Independent CStar validation receipts recorded during reconciliation:

- `validation:cstar-pr40-r0-baseline-20260730-v2`
- `validation:cstar-pr40-r3-portability-20260730`
- `validation:cstar-pr40-r3b-runtime-artifact-cleanup-20260730`
- `validation:cstar-pr40-r4-async-ledger-20260730`
- `validation:cstar-pr40-r5-verification-artifact-20260730`
- `validation:cstar-pr40-r6-hermes-intake-20260730`
- `validation:cstar-pr40-r7a-gungnir-score-20260730`
- `validation:cstar-pr40-r7b-registry-calculus-20260730`
- `validation:cstar-pr40-r8-repair-20260730`

No final whole-branch R8 acceptance identifier is claimed until the complete
post-repair plan passes and its clean candidate receipt is independently
validated.

## Hall diagnosis

The Hall is readable and the live kernel reports health 100. No
`database disk image is malformed` error was reproduced.

Snapshot checks found:

- one localized FTS5 checksum mismatch in `intents_fts`;
- 98 historical foreign-key orphans;
- successful additive PR40 Worker Jobs schema and queue operations;
- no newer-schema rejection.

PR40's startup failures are better explained by root/path drift, missing local
`node_modules/tsx`, non-atomic bootstrap, and test-isolation behavior than by a
globally malformed Hall.

Hall integrity maintenance is tracked separately as
`bead:cstar:hall-integrity-maintenance-20260730`. Reconciliation must not repair,
delete, or rewrite live Hall rows.

## Acceptance

The combined branch is not accepted until:

- every active test is included in bounded discovery;
- no touched production or focused-test file exceeds 500 lines;
- diff check, typecheck, complete Node and Python suites, distribution
  validation, Forge authority, root, persona, validation, and worker-migration
  suites pass;
- source, package, lifecycle, and runtime evidence remain distinct;
- a clean candidate receipt binds every tracked and untracked byte;
- an independent validator records the result in CStar.

Source acceptance does not authorize activation, deployment, merge, or a
production claim.

Final source acceptance, if independently recorded after a clean candidate
receipt, remains distinct from runtime verification and does not itself
authorize activation, restart, merge, deployment, or production use.

## R8 pre-acceptance evidence

This pass is pre-acceptance evidence only. It creates no final verification
receipt and records no CStar result.

- `git diff --check`: passed.
- `npm run typecheck`: passed in 4.13 seconds wall time.
- Complete active Node discovery using `scripts/verify.ts` semantics found 244
  files, excluding only `tests/quarantine`. The full run reported 1,536 tests:
  1,534 passed, 1 failed, and 1 skipped in 171.316 seconds reported duration
  (156.51 seconds wall time).
- Complete Python discovery used the existing CStar interpreter through
  `scripts/run-python.mjs`, with native `/tmp` containment and
  `tests/quarantine` excluded. It collected 773 tests: 770 passed, 2 failed,
  and 1 skipped in 13.09 seconds reported duration (14.01 seconds wall time).
- `npm run validate:distributions`: passed; 8 artifacts verified in 0.70
  seconds wall time.
- The complete authority, root, persona, Forge, validation, worker, registry,
  and Gungnir focused suites were subsumed by the complete Node and Python
  discovery above.
- The base-to-candidate inspection covered 229 tracked changed paths plus the
  one non-ignored untracked report (230 candidate paths total). One changed
  production or focused-test source file exceeds 500 lines:
  `.agents/skills/corvus-forge/runtime/hermes_cli/forge_entrypoint.py` at 520
  lines. No changed focused-test source file exceeds 500 lines.

### Bounded repair manifest

1. In
   `tests/unit/cstar-kernel-mcp/test_instrumentation_mutation_identity.test.ts`,
   update the stale Forge-authorize assertion to expect the accepted,
   pre-authorization-safe `forge_operator_authorization_required` envelope.
   The handler deliberately suppresses raw `codex_request_identity_*` detail
   before authorization; the test still confirms no telemetry or Hall
   artifacts are written.
2. In `tests/unit/test_current_documentation_contract.py`, distinguish the
   three agent-native host skills from the accepted `calculus` PRIME,
   compatibility-only registry entry instead of asserting that the registry
   contains only three entries.
3. In `tests/unit/test_retired_surface_documentation_contract.py`, align the
   compatibility-pointer assertion with the accepted minimal `AGENTS.qmd`
   contract. Do not copy detailed procedures back into the pointer; verify
   detailed invariants against `AGENTS.md` or the selected runbook.
4. Split or extract behavior from
   `.agents/skills/corvus-forge/runtime/hermes_cli/forge_entrypoint.py` so the
   production file is at most 500 lines without changing its sealed runtime
   contract.

After those bounded repairs, rerun the complete R8 plan before creating a clean
candidate receipt. No merge, runtime, activation, deployment, or production
claim follows automatically from a passing rerun.

### Repair result

The four bounded repairs were implemented in `7c34a84d` and independently
accepted as `validation:cstar-pr40-r8-repair-20260730`.

- The instrumentation assertion now requires the exact fail-closed
  `forge_operator_authorization_required` result while retaining the write-free
  telemetry and Hall checks.
- Registry documentation now distinguishes the three default host-native
  entries from hidden, unsupported compatibility-only `calculus`.
- `AGENTS.qmd` remains a minimal pointer to canonical policy, Gherkin routing,
  and selected runbooks; retired detailed policy was not restored.
- Forge response parsing moved into a sealed support module. The runtime
  manifest, lineage digest, and delegate evidence all bind the six-file sealed
  source set.
- The focused repair matrix passed 129 tests, typecheck, Python syntax, diff
  checks, and the 500-line limit.

Whole-branch acceptance remains pending the complete post-repair rerun and
independent clean-receipt validation.
