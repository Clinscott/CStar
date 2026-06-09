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

Optional inputs:

- Prior worker receipts.
- Existing CStar result ids.
- PR #26 and PR #28 disposition notes.
- Local bare-remote non-live integration test location.

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
  validated, and reviewed.

## Installation Posture

Do not install this as a durable Codex skill yet. The acceptance order is:

1. Review and accept these docs.
2. Accept required CStar/cstar-console runtime surfaces.
3. Validate non-live proof flows.
4. Obtain separate CoS approval for skill installation.
5. Install as a recall wrapper only, with no hidden execution authority.
