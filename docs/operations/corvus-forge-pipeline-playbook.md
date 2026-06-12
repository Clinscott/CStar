# Corvus Forge Pipeline Playbook

Corvus Forge is the temporary production-readiness pipeline for moving accepted
Researcher/PPR work into reviewed implementation packages without weakening
CStar authority. This playbook is canonical for recall and operator routing; it
does not authorize live-fire dispatch by itself.

## Route

The standard route is:

`Researcher/PPR -> CStar bead -> GitHub issue -> PMT work branch -> Hermes MiniMax SwarmForge -> worker branch -> worker PR -> PMT review -> MM summary -> CoS decision`

Every step must retain the same CStar bead id and GitHub issue link. Work that
cannot name its bead, issue, branch, validation evidence, and reviewer verdict
is not ready for CoS decision.

## Authority Model

- CStar remains the authority for beads, acceptance criteria, lifecycle state,
  validation/result ids, exceptions, and closeout.
- GitHub is the issue, branch, PR, and review ledger.
- The PMT owns project integration, worker PR acceptance, PMT work branch
  stewardship, review receipts, and final project packet to MM.
- Hermes MiniMax SwarmForge workers produce worker branches and worker PRs only.
  They do not merge, publish, deploy, restart, mutate secrets/config, or close
  CStar state.
- MM owns estate routing, sequencing, cross-repo conflicts, and concise upward
  summaries.
- CoS owns CEO-facing risk calls, yellow/red exceptions, and final approval
  routing.
- No main/master merge, deploy, restart, secret/config mutation, destructive
  cleanup, direct Hall/SQLite write, branch protection change, broad PMT memory
  rollout, durable skill installation, or live-fire retry occurs by default.

## Packaging Modes And Validation

Every source-work intake declares one packaging mode before edits:

- `PR_REQUIRED`: normal mode. Bead-linked issue, PMT work branch, worker branch,
  worker PR, PMT review, and integration PR are required.
- `LOCAL_EXCEPTION_WITH_FOLLOWUP_PR`: only with explicit approval. The closeout
  packet must route a follow-up GitHub packaging decision.
- `NO_GITHUB_DOCS_ONLY`: allowed only for low-risk docs/memory changes when MM
  or CoS accepts no PR package.

GitHub Actions are advisory and non-blocking unless a repo separately opts into
them as authority. Required evidence is PMT local validation, CStar validation
result ids, CStar Console witness receipts/status when available, and reviewed
PR artifacts.

## Quota And Runtime Availability Gate

If MM or PMT thread turns append but produce no agent response, or thread
metadata shows `systemError` or another runtime failure and the evidence points
to usage/quota exhaustion, classify the event as a yellow coordination/runtime
availability gate.

Non-response is not a PMT verdict, design acceptance, routing approval, or
permission to bypass MM/PMT for live-fire. Live-fire/model-spend stops until the
coordination runtime is healthy or CoS explicitly approves a narrow yellow
exception. During a quota/runtime outage, CoS may perform non-live, read-only, or
docs consolidation work, but must not launch live SwarmForge/model dispatch.

## Exact-Head And Head-Drift Gate

Every live-fire authorization must name the exact PR or package head SHA.
Prelaunch must compare the authorized head against the current PR/package head
and fail before packet generation or model spend if the head changed.

If user-owned work advances the branch, classify the head drift, preserve the
new user-owned head, and revalidate in an isolated exact-head environment before
accepting that head as the new base. A shifted branch is never silently treated
as the previously authorized package.

## Dirty-Root And User-Owned Work Isolation

Active user work in a spoke root must not be cleaned, reset, stashed, deleted,
checked out over, or overwritten by Forge review, validation, prelaunch, or
finalization. This explicitly includes user-owned MongoDB/host-sync work in
`/home/morderith/Corvus/cstar-console`.

When local roots are dirty or shifting, use isolated clones or worktrees for
review and live-fire prelaunch. The isolated runtime root is the worker-facing
access surface; dirty or prohibited roots remain evidence metadata and are not
used for mutation.

## Mongo And Host-Sync ENV_GATED Gate

MongoDB and host-sync smoke checks default to non-mutating `ENV_GATED` behavior.
They may report that live proof is skipped unless explicit live flags and
required environment are present.

Live MongoDB proof is a separate yellow gate. It requires explicit authorization,
`CSTAR_MONGO_URI`, and the required live flag. It is not implied by Forge
live-fire authorization, docs validation, PR review, or local non-live finalizer
coverage.

## Dispatch Packet Invariants

Every SwarmForge dispatch packet must include:

- `decision_id` and `decision_scope`.
- `retry_budget` and `retry_spent`.
- `new_gate_requested=false` unless CoS/MM explicitly approves a new gate.
- Isolated repo root and prohibited repo roots.
- PMT work branch and worker PR target branch; target must not be `main` or
  `master`.
- One named finalizer and a branch ownership lock.
- Explicit YOLO/headless policy.
- Exact validation commands.
- Expected artifacts/evidence.
- Escalation class and stop conditions.
- Explicit text: `Do not merge or push to main/master.`

## Evidence Model

The minimum evidence chain is:

- Dispatch packet.
- Worker receipt.
- Artifact manifest.
- Local bare-remote non-live integration test when implementation packaging
  needs a merge simulation without touching the protected branch.
- Worker PR and PMT review verdict.
- MM summary and CoS decision packet.
- CStar result id and closeout status after acceptance.

Finalizer manifest sidecars do not count against operator `max_changed_files`
when they are generated as constrained evidence sidecars. Generated sidecars
must remain bounded, named, validated, and reviewed; they are not a license to
hide product/source diffs.

## Proof Artifact Classes

Live-fire proof packages must distinguish real code/test targets from
docs/evidence artifacts:

- Real code/test proof targets may be runtime source files, test files, and
  generated manifest sidecars. They must pass syntax, selected-file safety,
  output-quality, finalizer manifest, and lint requirements appropriate to the
  target language, but they must not be forced to embed operational proof prose
  inside source code.
- Docs/evidence targets may be markdown receipts, proof narratives, readiness
  notes, and generated manifest sidecars. They remain subject to stricter proof
  narrative, stale-lifecycle, retry/decision, finalizer truthfulness, and
  manifest evidence rules.

Docs/evidence or lint-only work cannot satisfy the required real code/test
proof slot. The code/test proof slot requires a reviewed worker PR whose selected
target set includes runtime source or test files and verified finalization.

## Finalizer Source Mode

Live-fire packets must declare a machine-readable `finalizer_source_mode` when
the proof shape depends on artifact source selection. For real code/test proofs,
the normal mode is `packet_repo_root`, meaning the finalizer reads selected
artifacts from the packet's isolated repo root rather than from ambient local
state or prose claims.

Allowed source mode values must be explicit in the dispatch packet and repeated
in generated manifest sidecars. Multi-source ambiguity, missing source mode,
default source selection, or disagreement between `finalizer_source_mode`,
`packet_repo_root`, selected artifacts, and manifest metadata stops before
finalizer mutation.

## Prefinalizer Syntax And Selected-File Safety

Before the finalizer command mutates a worker worktree, stages files, commits,
pushes, or opens a worker PR, the controller must run direct checks over every
selected target file and generated manifest sidecar:

- JS/MJS/CJS runtime source or test targets require safe syntax validation such
  as `node --check <file>` before finalizer mutation.
- Runnable non-live test commands should run when dependency-safe.
- Live MongoDB, secrets, config, or host-sync paths remain `ENV_GATED` and do
  not run without explicit live authorization.
- Selected-file safety checks must scan selected files and manifest sidecars
  directly for trailing whitespace, conflict marker text, allowed target scope,
  and unexpected selected-file diffs independent of Git tracking state.
- Finalizer templates must mirror the prefinalizer syntax and selected-file
  safety checks before staging, commit, push, or PR creation.

Syntax failures, trailing whitespace failures, conflict marker hits, selected
file scope drift, or unsafe diffs block before finalizer command execution,
worker worktree mutation, commit, push, or worker PR creation.

## Finalizer Success Truth Gate

Finalizer success is not accepted from role-authored claims alone. Before any
finalizer success, commit, push, or PR creation is accepted, the controller must
perform a direct selected artifact safety gate over selected target artifacts
and generated manifest sidecars, including untracked role-worktree artifacts:

- Trailing whitespace scan over selected artifacts.
- Conflict marker scan over selected artifacts.
- Scope check against the allowed changed-file list.
- Selected-file diff safety check independent of Git tracking state.
- Syntax check for selected runtime source/test files when the language has a
  safe non-live syntax gate.
- Generated sidecar check against the derived target paths.

The finalizer-result proof must include:

- Finalizer-result `status` and `completion`.
- Verified finalization status.
- `finalizer_source_mode` and `packet_repo_root` when used.
- Finalizer-worker worktree path.
- Worker branch.
- Commit hash.
- `push_ok`.
- PR URL and PR state.
- Changed files and target paths.
- Artifact source/root metadata.
- `isolated_runtime_root`.
- `prohibited_repo_roots`.

Missing or inconsistent finalizer-result proof is a hard failure. A role report
that says finalization succeeded is evidence only after the controller verifies
the finalizer-result fields above.

## Manifest Sidecar Schema

Generated manifest sidecars are mandatory when finalizer evidence is produced.
They are excluded from operator `max_changed_files` only when they stay
constrained to derived target paths and pass validation. Each sidecar must
include:

- Schema/version id.
- Bead id, decision id, worker id, finalizer id, and source role.
- `finalizer_source_mode`.
- `packet_repo_root` when the source mode is `packet_repo_root`.
- `isolated_runtime_root`.
- `prohibited_repo_roots`.
- Source artifact root and selected artifact source path.
- Target path list.
- Path/hash metadata for each selected artifact.
- Worker branch, target branch, and commit hash.
- Push state and PR URL/state when a PR is created.
- Finalizer-result status/completion.

## Metadata And Access Split

Prohibited roots remain preserved as evidence metadata even when workers do not
receive access to those roots. Worker-facing access paths and commands must use
the isolated runtime root. The isolated runtime root must not be mislabeled as a
prohibited root, and prohibited root metadata must not be converted into worker
access.

## Deterministic Finalizer Handoff

The controller must hand exactly one complete allowed role artifact source to
the finalizer. Zero allowed sources, multiple allowed sources, missing runtime
metadata, or guard failures stop before PR creation. The finalizer receives the
validated artifact source explicitly; it must not infer artifact roots from
ambient working directories or role prose.

## Non-Live Finalizer Integration

Non-live finalizer coverage must use a local bare remote plus fake-gh coverage
for finalizer-worker branch ownership, commit, push, and PR mechanics. This
coverage must not spend model tokens, mutate GitHub, or touch protected
branches. It proves packaging mechanics before any live-fire run is considered.

## Stop Conditions

Stop and escalate to MM/CoS when any of these occur:

- Missing bead id, issue link, branch, PR target, validation command, or receipt.
- Worker PR target is `main` or `master`.
- Branch ownership lock conflict.
- Retry budget exhausted or retry spending not tracked.
- New gate appears without approval.
- Dirty-root mutation or mutation outside the isolated repo root.
- Secret/config mutation, deploy/restart, destructive cleanup, direct
  Hall/SQLite write, branch protection change, or main/master publication is
  requested.
- GitHub Actions failure is treated as authority without explicit opt-in.
- CStar MCP transport is unavailable and no approved degraded fallback is named.
- MM/PMT reporting path is unhealthy, quota-limited, or producing appended turns
  without agent responses, unless CoS approves a narrow yellow exception.
- Live-fire authorization omits the exact PR/package head SHA.
- PR/package head drift is detected before packet generation or model spend.
- User-owned dirty-root work would need cleanup, checkout, stash, reset,
  deletion, overwrite, or mutation.
- MongoDB/host-sync proof would require live mutation without explicit
  authorization, `CSTAR_MONGO_URI`, and the required live flag.
- Evidence receipt, artifact manifest, or PR artifact scope is inconsistent.
- Missing selected-artifact whitespace/conflict-marker scan.
- Missing manifest sidecar runtime metadata.
- Missing finalizer-result proof.
- Role-authored unverified finalizer success claim.
- Stale lifecycle text.
- Duplicate worker branch or PR.
- Dirty/prohibited root access.
- New yellow/red gate without approval.

## Closeout

PMT closeout must include bead id, issue link, branch and PR links, validation
commands/results, CStar result ids, CStar Console witness receipt/status if
available, changed-file scope, worker receipts, risk notes, PMT verdict, MM
summary, and CoS decision state. Acceptance is not execution; accepted work is
executed only after separate operator dispatch.
