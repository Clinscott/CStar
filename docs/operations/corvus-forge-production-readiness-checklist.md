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

## Live-Fire Proof Bar

Corvus Forge is not temporary-production-ready until all are true:

- Three clean live-fire proofs are accepted by CoS.
- At least two repos participate in accepted proofs.
- At least one proof produces a real code/test worker PR, not docs-only work.
- No dirty-root mutation occurs during dispatch or finalization.
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
  finalizer id, source role, `isolated_runtime_root`,
  `prohibited_repo_roots`, source artifact root, target paths, path/hash
  metadata, branch/commit metadata, push state, PR URL/state, and
  finalizer-result status/completion.
- Finalizer success requires controller-verified finalizer-result truthfulness:
  finalizer-worker worktree, worker branch, commit hash, `push_ok`, PR
  URL/state, changed files, target paths, artifact source/root metadata,
  `isolated_runtime_root`, and `prohibited_repo_roots`.
- Selected target artifacts and generated manifest sidecars, including
  untracked role-worktree artifacts, pass direct whitespace and conflict-marker
  scans before finalizer success, commit, push, or PR creation.
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

Also stop for missing selected-artifact scans, missing manifest sidecar runtime
metadata, missing finalizer-result proof, role-authored unverified finalizer
claims, stale lifecycle text, duplicate worker branch/PR, dirty or prohibited
root access, main/master target, or a new yellow/red gate without approval.
