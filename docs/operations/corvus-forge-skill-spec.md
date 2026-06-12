# Corvus Forge Skill Spec

The Corvus Forge skill posture is docs/playbook first. A future skill may make
the pipeline recallable, but the skill is an operating wrapper, not the engine.
It must not become a hidden dispatcher, authority bypass, or replacement for
CStar beads, GitHub review, PMT review, MM summary, or CoS decision gates.

## Purpose

The future skill should help an agent recall and assemble a Corvus Forge work
packet from canonical doctrine. It should produce prompts, checklists, and
review packets that point to CStar and GitHub authority surfaces. It must not
perform live dispatch, merge, deploy, restart, mutate secrets/config, write
Hall/SQLite directly, install itself durably, or roll out PMT memory changes
without separate approval.

## Trigger Signals

Use the skill only after docs/runtime surfaces are accepted and CoS separately
approves skill installation. Candidate trigger signals:

- `Corvus Forge`
- `SwarmForge dispatch packet`
- `temporary production readiness`
- `Researcher/PPR -> CStar bead -> GitHub issue`
- `worker PR -> PMT review`
- `live-fire proof`
- `finalizer manifest sidecar`

## Inputs

Required inputs:

- CStar bead id and status.
- GitHub issue link.
- PMT work branch.
- Worker branch and worker PR target branch.
- Decision id and decision scope.
- Retry budget and retry spent.
- Isolated repo root and prohibited repo roots.
- YOLO/headless policy.
- Validation commands.
- Expected receipts, artifact manifest, and CStar Console witness evidence.
- Escalation class.
- Proof artifact class: real code/test or docs/evidence.
- `finalizer_source_mode`, with `packet_repo_root` for real code/test proofs
  when the finalizer reads selected artifacts from the isolated packet repo.
- Selected source/test target files and docs/evidence target files, kept as
  separate lists.
- JS/MJS/CJS syntax check commands such as `node --check <file>` for selected
  runtime source/test targets.
- Current MM thread id and PMT reporting path health.
- Quota/runtime availability evidence, including appended turns without agent
  response and any `systemError` or runtime failure text.
- Authorized PR/package exact head SHA for any live-fire request.
- Current PR/package head SHA and head drift classification.
- Dirty-root status for each relevant repo and the isolated exact-head worktree
  or clone used for validation.
- MongoDB/host-sync mode, which defaults to non-mutating `ENV_GATED`, plus
  explicit live authorization, `CSTAR_MONGO_URI`, and the required live flag when
  live Mongo proof is requested.
- Selected target artifact list and generated manifest sidecar list.
- Finalizer-result proof fields: status/completion, finalizer-worker worktree,
  worker branch, commit hash, `push_ok`, PR URL/state, changed files, target
  paths, artifact source/root metadata, `isolated_runtime_root`, and
  `prohibited_repo_roots`.
- Manifest sidecar runtime fields: schema/version id, bead id, decision id,
  finalizer id, source role, isolated runtime root, prohibited repo roots,
  path/hash metadata, branch metadata, commit hash, push state, and PR state.
- Exactly one complete allowed role artifact source for deterministic handoff.

Optional inputs:

- Prior worker receipts.
- Existing CStar result ids.
- PR #26 and PR #28 disposition notes.
- Local bare-remote and fake-gh non-live integration test location.

## Outputs

Allowed outputs:

- Dispatch packet draft.
- Worker boot packet draft.
- PMT review checklist.
- MM summary template.
- CoS decision packet template.
- Production-readiness checklist instance.
- Stop-condition report.
- Proposed CStar result closeout text.
- Selected-artifact trailing whitespace, conflict marker, and selected-file diff
  safety checklist.
- Prefinalizer syntax/output-quality checklist.
- Manifest sidecar schema checklist.
- Finalizer-result truthfulness checklist.

Disallowed outputs:

- Live dispatch.
- GitHub merge or main/master publication.
- Deploy/restart.
- Secret/config mutation.
- Destructive cleanup/reset/history rewrite.
- Direct Hall/SQLite write.
- Branch protection change.
- Broad PMT memory rollout.
- Durable skill installation.
- Dirty spoke-root mutation.
- Treating MM/PMT non-response, quota exhaustion, or `systemError` as a PMT
  verdict, design acceptance, or live-fire bypass.
- Live-fire/model-spend during a coordination/runtime availability outage unless
  CoS explicitly approves a narrow yellow exception.
- Packet generation or model spend after exact-head/head drift is detected.
- Cleanup, reset, stash, deletion, checkout over, overwrite, or mutation of
  user-owned dirty-root work, including MongoDB/host-sync work in
  `/home/morderith/Corvus/cstar-console`.
- Live MongoDB proof without explicit authorization, `CSTAR_MONGO_URI`, and the
  required live flag.
- Counting docs/evidence or lint-only artifacts as the required real code/test
  proof.
- Forcing operational proof prose into runtime source/test files.
- Proceeding with missing `finalizer_source_mode`, ambiguous default source
  selection, or multiple possible artifact sources.
- Running a finalizer command, mutating a worker worktree, committing, pushing,
  or opening a worker PR after JS/MJS/CJS syntax, trailing whitespace, conflict
  marker, selected-file diff safety, manifest, or verified finalization failure.

## Gates

- Green: draft packets, docs-only checklist instances, local validation command
  recommendations, PR body templates, and review summaries.
- Yellow: CStar control-plane behavior, automation behavior, MCP degraded
  fallback, SwarmForge dispatch, branch/PR routing, generated sidecar policy,
  evidence consistency exceptions, and any live-fire preparation.
- Red: merge/main publication, deploy/restart, secret/config mutation,
  destructive cleanup, direct Hall/SQLite write, branch protection changes,
  runtime authority model changes, broad rollout, or live-fire without CoS/CEO
  approval.

## Operating Rules

- The skill must preserve the route:
  `Researcher/PPR -> CStar bead -> GitHub issue -> PMT work branch -> Hermes MiniMax SwarmForge -> worker branch -> worker PR -> PMT review -> MM summary -> CoS decision`.
- The skill must require packaging mode: `PR_REQUIRED`,
  `LOCAL_EXCEPTION_WITH_FOLLOWUP_PR`, or `NO_GITHUB_DOCS_ONLY`.
- The skill must state that GitHub Actions are advisory/non-blocking unless a
  repo separately opts into them.
- The skill must prefer PMT local validation, CStar result ids, and CStar
  Console witness receipts/status as primary evidence.
- The skill must enforce one finalizer, branch ownership lock, retry
  budget/spent, explicit YOLO/headless policy, and no worker PR target to
  `main` or `master`.
- The skill must require that finalizer manifest sidecars stay constrained,
  validated, reviewed, and excluded from operator `max_changed_files` only when
  they are generated from derived target paths.
- The skill must require direct whitespace and conflict-marker scans over
  selected target artifacts and generated manifest sidecars, including
  untracked role-worktree artifacts, before finalizer success, commit, push, or
  PR creation.
- The skill must distinguish real code/test proof targets from docs/evidence
  targets. Real code/test targets may be source/test files and generated
  manifest sidecars; docs/evidence targets remain subject to stricter proof
  narrative, stale-lifecycle, retry/decision, finalizer truthfulness, and
  manifest evidence strictness.
- The skill must not count docs/evidence or lint-only work as the required
  Proof 3 real code/test proof, and must not require operational proof prose
  inside runtime source/test files.
- The skill must require `finalizer_source_mode` when proof shape depends on
  artifact source selection. Real code/test proofs normally declare
  `packet_repo_root`. Missing source mode, default source selection ambiguity, or
  multiple source candidates stop before finalizer mutation.
- The skill must require safe prefinalizer JS/MJS/CJS syntax gates such as
  `node --check <file>` before finalizer command execution, worker worktree
  mutation, commit, push, or worker PR creation. Runnable non-live tests should
  run when dependency-safe; live MongoDB, secrets, config, and host-sync paths
  remain `ENV_GATED`.
- The skill must require selected-file safety directly over selected targets and
  manifest sidecars: trailing whitespace, conflict marker text, selected-file
  diff safety, and allowed target scope independent of Git tracking state.
- The skill must make finalizer templates mirror prefinalizer syntax and
  selected-file safety checks before staging, commit, push, or PR creation.
- The skill must reject role-authored unverified finalizer success claims. No
  finalizer success is accepted without finalizer-result status/completion,
  verified finalization, `finalizer_source_mode`, `packet_repo_root` when used,
  finalizer-worker worktree, worker branch, commit hash, `push_ok`, PR URL/state,
  changed files, target paths, artifact source/root metadata,
  `isolated_runtime_root`, and `prohibited_repo_roots`.
- The skill must preserve the metadata/access split: prohibited roots remain
  evidence metadata while worker-facing access paths and commands use isolated
  runtime roots.
- The skill must hand exactly one complete allowed role artifact source to the
  finalizer. Zero sources, multiple sources, missing runtime metadata, or guard
  failures stop before PR creation.
- The skill must name local bare-remote plus fake-gh coverage for
  finalizer-worker branch ownership, commit, push, and PR mechanics before any
  live-fire proof is counted.
- The skill must classify appended MM/PMT turns without agent response, quota
  exhaustion evidence, or `systemError` runtime failure as a yellow
  coordination/runtime availability gate. Non-response is never acceptance.
- The skill must stop live-fire/model-spend until the MM/PMT reporting path is
  healthy or CoS explicitly approves a narrow yellow exception. Non-live,
  read-only, and docs consolidation may continue under CoS direction during the
  outage.
- The skill must require every live-fire authorization to name an exact
  PR/package head SHA, compare it immediately before prelaunch, and fail before
  packet generation or model spend if head drift is detected.
- The skill must classify user-owned branch advancement and revalidate it in an
  isolated exact-head environment before treating it as a new base.
- The skill must protect dirty roots and user-owned work from cleanup, reset,
  stash, deletion, checkout-over, overwrite, or mutation. Review and prelaunch
  use isolated clones or worktrees when local roots are dirty or shifting.
- The skill must keep MongoDB/host-sync checks non-mutating/`ENV_GATED` unless
  live Mongo proof is separately authorized with `CSTAR_MONGO_URI` and the
  required live flag. Forge live-fire and docs validation do not imply live Mongo
  authorization.

## Installation Posture

Do not install this as a durable Codex skill yet. The acceptance order is:

1. Review and accept these docs.
2. Accept required CStar/cstar-console runtime surfaces.
3. Validate non-live proof flows.
4. Obtain separate CoS approval for skill installation.
5. Install as a recall wrapper only, with no hidden execution authority.
