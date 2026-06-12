# Corvus Forge Production Readiness Checklist

This checklist defines the temporary production-readiness bar for Corvus Forge.
It is a gate checklist, not live-fire authorization.

## Baseline Requirements

- Parent bead `bead-corvus-forge-pipeline-hardening-livefire` remains tracked.
- No known P1/P2 defects remain open against the temporary pipeline.
- PR #6 manifest/max_changed_files repair is accepted.
- PR #26 non-Actions GitHub workflow disposition is tracked.
- PR #28 Augury stale-session routing repair disposition is tracked.
- CStar MCP health is known; if degraded, exact `Transport closed` or other
  blocker text is reported and no Hall/SQLite bypass is used.
- GitHub issue/branch/PR packaging exists for source work unless an approved
  docs-only/no-GitHub exception applies.
- MM/PMT coordination health is known. If turns append without agent response,
  or thread metadata shows `systemError` or runtime failure consistent with
  quota exhaustion, classify it as a yellow coordination/runtime availability
  gate.
- Non-response is not a PMT verdict, design acceptance, or permission to bypass
  MM/PMT for live-fire/model-spend.
- Further routing requires a healthy MM/PMT reporting path or an explicit CoS
  yellow exception.

## Live-Fire Proof Bar

Corvus Forge is not temporary-production-ready until all are true:

- Every live-fire authorization names the exact PR/package head SHA.
- Prelaunch compares the authorized exact head to the current PR/package head and
  fails before packet generation or model spend on head drift.
- User-owned branch advancement is classified and revalidated in an isolated
  exact-head environment before it becomes the new base.
- Three clean live-fire proofs are accepted by CoS.
- Proof 1 is accepted as the initial finalization/manifest proof.
- Proof 2 is accepted from a second repo.
- Proof 3 is accepted as a real code/test proof, with selected runtime source or
  test targets, generated manifest sidecars, verified finalization, and PMT
  review. Docs/evidence or lint-only proof packages do not satisfy Proof 3.
- At least two repos participate in accepted proofs.
- At least one proof produces a real code/test worker PR, not docs-only work.
- No dirty-root mutation occurs during dispatch or finalization.
- Active user work in dirty roots, including `/home/morderith/Corvus/cstar-console`
  MongoDB/host-sync work, is never cleaned, reset, stashed, deleted, checked out
  over, or overwritten by Forge validation.
- Isolated clones or worktrees are used for review and live-fire prelaunch when
  local roots are dirty or shifting.
- MongoDB and host-sync checks remain non-mutating/`ENV_GATED` unless live Mongo
  proof is explicitly authorized with `CSTAR_MONGO_URI` and the required live
  flag.
- PMT review accepts every worker PR before MM summary.
- CStar result ids are recorded for dispatch, validation, review, and closeout.
- CStar Console witness receipts/status are attached when available.
- Live-fire remains separately gated by CoS; this checklist cannot authorize it.

## PR And Artifact Gates

- Every PR names CStar bead id(s), GitHub issue, packaging mode, branch/base,
  target branch, changed-file scope, validation commands/results, CStar result
  ids, MCP status, risk notes, and merge-gated status.
- Worker PRs target PMT work branches, never `main` or `master`.
- PMT integration PRs to protected branches require CoS/CEO approval before
  merge/main publication.
- GitHub Actions are advisory/non-blocking unless the repo explicitly opts into
  them as authority.
- Local validation, CStar result ids, and CStar Console witness receipts/status
  are primary evidence.
- Finalizer manifest sidecars are constrained, validated, and reviewed; they do
  not count against operator `max_changed_files` when produced as evidence
  sidecars, but they must not conceal product/source changes.
- Generated manifest sidecars include schema/version id, bead id, decision id,
  finalizer id, source role, `finalizer_source_mode`, `packet_repo_root` when
  used, `isolated_runtime_root`, `prohibited_repo_roots`, source artifact root,
  target paths, path/hash metadata, branch/commit metadata, push state, PR
  URL/state, and finalizer-result status/completion.
- Finalizer success requires controller-verified finalizer-result truthfulness:
  verified finalization status, `finalizer_source_mode`, `packet_repo_root`
  when used, finalizer-worker worktree, worker branch, commit hash, `push_ok`,
  PR URL/state, changed files, target paths, artifact source/root metadata,
  `isolated_runtime_root`, and `prohibited_repo_roots`.
- Selected target artifacts and generated manifest sidecars, including
  untracked role-worktree artifacts, pass direct trailing whitespace, conflict
  marker, and selected-file diff safety scans before finalizer success, commit,
  push, or PR creation.
- JS/MJS/CJS runtime source/test targets pass safe syntax validation such as
  `node --check <file>` before finalizer command execution, worker worktree
  mutation, commit, push, or worker PR creation.
- Runnable non-live tests run when dependency-safe. Live MongoDB, secrets,
  config, and host-sync paths remain `ENV_GATED`.
- Runtime source/test targets must pass syntax/output-quality validation and
  finalizer manifest/lint requirements without embedding operational proof prose
  inside source code. Docs/evidence artifacts remain subject to proof narrative,
  stale-lifecycle, retry/decision, finalizer truthfulness, and manifest evidence
  strictness.
- Prohibited roots are evidence metadata, not worker access paths. Worker-facing
  commands use isolated runtime roots, and isolated runtime roots are not
  mislabeled as prohibited roots.

## Dispatch Invariant Checks

Before dispatch, confirm:

- `decision_id` is unique and machine-readable.
- `decision_scope` matches the bead acceptance criteria.
- `retry_budget` and `retry_spent` are present.
- No new gate is introduced without approval.
- Isolated repo root is explicit.
- Prohibited repo roots are explicit.
- Worker branch and worker PR target branch are explicit.
- Worker PR target is not `main` or `master`.
- One finalizer is named.
- Branch ownership lock is present.
- YOLO/headless policy is explicit.
- `finalizer_source_mode` is explicit when proof shape depends on artifact source
  selection; real code/test proofs normally use `packet_repo_root`.
- Exactly one complete allowed role artifact source is present for deterministic
  finalizer handoff.
- Zero role artifact sources, multiple role artifact sources, missing runtime
  metadata, or guard failures stop before PR creation.
- Stop conditions and escalation class are explicit.

## Non-Live Finalizer Coverage

Before live-fire, local bare-remote and fake-gh coverage proves
finalizer-worker branch ownership, commit, push, and PR mechanics without model
spend, GitHub mutation, protected branch mutation, or dirty-root access.

## Readiness Verdicts

- `READY_FOR_REVIEW`: docs, package, and local validation are complete, but CoS
  has not accepted the readiness claim.
- `CONDITIONALLY_READY`: CoS accepts non-live hardening continuation while one
  or more tracked blockers remain for live-fire.
- `READY_FOR_TEMP_PRODUCTION`: CoS accepts all baseline requirements, live-fire
  proof bar, PR/artifact gates, and CStar closeout evidence.
- `BLOCKED`: any P1/P2, dirty-root mutation, missing evidence, failed MCP
  authority path, or unapproved yellow/red action remains.

## Stop And Escalate

Stop and escalate for missing evidence, unreviewed worker PRs, untracked PR #26
or PR #28 disposition, dirty-root mutation, failed CStar result recording,
secret/config mutation, deploy/restart, destructive cleanup, direct Hall/SQLite
write, branch protection change, main/master publication, or any live-fire
request without explicit CoS approval.

Also stop when MM/PMT turns append without response, `systemError` or quota-like
runtime failure blocks reporting, live-fire/model-spend is requested during a
coordination outage, a live-fire request omits the exact head SHA, head drift is
detected before prelaunch, isolated exact-head validation is missing after branch
advancement, MongoDB/host-sync proof would run outside `ENV_GATED` constraints
without explicit live authorization, or dirty user-owned work would be mutated.

Also stop for missing selected-artifact scans, missing selected-file diff safety,
missing JS/MJS/CJS syntax gate for runtime source/test targets, missing manifest
sidecar runtime metadata, missing `finalizer_source_mode`, multi-source/default
source ambiguity, missing finalizer-result proof or verified finalization,
role-authored unverified finalizer claims, stale lifecycle text, duplicate
worker branch/PR, dirty or prohibited root access, main/master target, or a new
yellow/red gate without approval.
