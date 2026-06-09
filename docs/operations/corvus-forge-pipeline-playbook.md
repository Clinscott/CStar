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
- Evidence receipt, artifact manifest, or PR artifact scope is inconsistent.

## Closeout

PMT closeout must include bead id, issue link, branch and PR links, validation
commands/results, CStar result ids, CStar Console witness receipt/status if
available, changed-file scope, worker receipts, risk notes, PMT verdict, MM
summary, and CoS decision state. Acceptance is not execution; accepted work is
executed only after separate operator dispatch.
