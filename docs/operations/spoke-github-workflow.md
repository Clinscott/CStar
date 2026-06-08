# Spoke GitHub Workflow Doctrine

## Purpose

This doctrine defines how Corvus spoke code work moves through CStar and GitHub.
CStar remains canonical for work authority, beads, lifecycle state, acceptance
criteria, validation evidence, and closeout. GitHub is the packaging, review,
branch, pull request, and merge organization layer for spoke code work.
This doctrine is estate-wide for MM and all active PMTs. Individual project
PMTs may add stricter validation commands, but they must not weaken the CStar
authority chain.

Hard rules:

- No branch without a CStar bead id.
- No GitHub issue without a CStar bead id.
- No pull request without a CStar bead id.
- No merge without validation evidence recorded in or linked from CStar.
- No main or master publication without the required CoS/CEO gate.
- Every source-code implementation bead must declare a GitHub packaging mode
  before edits: `PR_REQUIRED`, `LOCAL_EXCEPTION_WITH_FOLLOWUP_PR`, or
  `NO_GITHUB_DOCS_ONLY`.
- A local commit exception does not close GitHub packaging by itself. It must
  produce a follow-up PR-packaging decision packet before closeout.
- `cstar-kernel` MCP `Transport closed` is a yellow blocker unless MM/CoS names
  an approved degraded fallback for the exact primitive being attempted.
- GitHub Actions are optional and non-blocking unless a future repo explicitly
  opts into them under a separate approved policy. They are not the authority
  gate for Corvus work.
- Validation authority comes from PMT local validation evidence, CStar
  validation/result ids, and CStar Console witness receipts or status.

## End-To-End Chain

Every line of spoke work must preserve this chain:

1. CStar bead
2. GitHub issue
3. PMT work branch
4. Worker PR or PRs into the PMT work branch
5. PMT integration PR to main or master
6. Main or master merge
7. CStar validation/result closeout

CStar owns whether the work exists and whether it is complete. GitHub organizes
how code review and merge packaging happen.

## Non-Actions Validation Authority

GitHub is the issue, branch, PR, and review ledger. GitHub Actions may exist as
useful signal, but they are advisory by default. A missing, skipped, failing, or
unconfigured GitHub Actions run does not by itself approve or block Corvus work
unless MM/CoS/CEO have explicitly made that repo's Actions authoritative.

Every PR package must carry a local validation receipt with:

- CStar bead id or ids.
- GitHub issue link.
- Packaging mode: `PR_REQUIRED`, `LOCAL_EXCEPTION_WITH_FOLLOWUP_PR`, or
  `NO_GITHUB_DOCS_ONLY`.
- Branch, base branch, and PR target.
- Changed-file scope.
- Exact local validation commands and results.
- CStar validation/result id or ids.
- PMT reviewer verdict.
- MCP status and degraded fallback, if any.
- Risk notes and merge-gated statement.
- Explicit statement that GitHub Actions are optional/non-blocking unless a
  future repo opts into them separately.

PMT final packets must include `GitHub workflow status`, MCP status, local
validation evidence, CStar result id or ids, and the follow-up PR packaging
decision when `LOCAL_EXCEPTION_WITH_FOLLOWUP_PR` was used.

## GitHub Packaging Modes

Declare one mode before source edits:

`PR_REQUIRED`:

- Use for normal source-code implementation work.
- Requires GitHub issue, PMT work branch, worker or PMT source branch, PR
  package, validation evidence, and CStar closeout.
- No local commit to the active branch unless the branch is the declared work
  branch and the commit is part of the PR package.

`LOCAL_EXCEPTION_WITH_FOLLOWUP_PR`:

- Use only when MM/CoS/CEO explicitly authorize a scoped local commit.
- The closeout packet must include `GitHub workflow status:
  local-exception-with-followup-pr`.
- The PMT must create or route a follow-up PR packaging decision packet before
  the bead can be treated as fully packaged.
- The local commit must list exact staged paths, validation evidence, commit
  hash, and remaining GitHub packaging gate.

`NO_GITHUB_DOCS_ONLY`:

- Use for docs/memory doctrine work that is explicitly allowed to remain local
  and does not include source-code implementation.
- The closeout packet must include `GitHub workflow status:
  no-github-docs-only`.
- This mode is not valid for source-code implementation files.

If the mode is missing, stop before edits and escalate to MM.

## Naming

GitHub issue title:

```text
[<bead-id>] <short actionable title>
```

Worker PR title:

```text
[<bead-id>] <worker-topic> -> <pmt-work-branch>
```

PMT integration PR title:

```text
[<bead-id>] PMT integration: <short-slug>
```

PMT work branch:

```text
work/<bead-id>-<short-slug>
```

Worker branch:

```text
worker/<bead-id>/<worker-topic>
```

The bead id must be exact. The short slug should be lowercase, hyphenated, and
stable enough to trace across issue, branch, and PR references.

## Required Labels

GitHub issues and PRs must use labels that make the CStar/GitHub chain visible.
Minimum labels:

- `bead-linked`: the item contains the exact CStar bead id.
- `PMT-work`: the item belongs to a PMT-managed work package.
- `worker-PR`: a worker PR targeting a PMT work branch.
- `integration-PR`: a PMT integration PR targeting main or master review.
- `validation-needed`: validation evidence is missing, incomplete, stale, or
  awaiting PMT review.
- `blocked`: progress is stopped pending owner action.
- `yellow-gate`: the item touches CStar/control-plane changes, automation,
  authority, bead/proposal routing, security posture, large diffs, or unclear
  ownership.
- `red-gate`: the item requests or approaches merge/main push, destructive
  cleanup, reset/history rewrite, production deploy/restart, secrets/config
  mutation, large binary/history change, CStar authority model change, or direct
  Hall/SQLite write.

Apply `yellow-gate` or `red-gate` only when the gate applies. Do not use labels
as approval; labels expose routing state.

## Required GitHub Issue Fields

Issue bodies must include these fields:

```text
CStar bead id:
Spoke/project:
Project root:
PMT thread:
Owning PMT:
Authority gate: Green | Yellow | Red
Acceptance criteria:
Target paths:
PMT work branch:
Expected worker branches:
Required validation evidence:
Known risks:
Required approvals:
CStar closeout plan:
GitHub packaging mode:
Current MM thread id:
```

The issue is a GitHub review container, not the source of authority. If the
issue disagrees with the bead, the bead wins and the issue must be corrected.

## Required PR Fields

All worker and integration PR bodies must include these fields:

```text
CStar bead id:
GitHub issue:
Source branch:
Target branch:
Role: worker PR | PMT integration PR
Changed paths:
Acceptance criteria covered:
Validation evidence:
Labels applied:
Remaining risks:
Required approvals:
CStar result or validation id:
GitHub workflow status:
```

Worker PRs must target the PMT work branch. PMT integration PRs target main or
master only after worker PRs are accepted into the work branch and validation is
complete.

## Required Links

Each issue and PR must link:

- CStar bead id.
- GitHub issue.
- Worker PRs.
- PMT integration PR.
- Validation evidence.
- CStar result or validation record when available.

If a link does not exist yet, use `pending` with the owner responsible for
creating it. Replace `pending` before merge.

## Roles

CoS:

- Owns CEO-facing priorities, risks, approvals, and visibility.
- Issues orders to MM and waits for reports.
- Gates red actions and main/master merge decisions with CEO where required.

MM:

- Owns thread architecture and the project-to-PMT routing map.
- Routes work to the correct pinned PMT.
- Does not continuously watch PMTs or workers.

PMT:

- Owns project execution tracking for its project root.
- Opens or proposes the GitHub issue and PMT work branch when authorized.
- Assigns fresh project-scoped workers.
- Accepts worker PRs into the PMT work branch after review and validation.
- Opens the integration PR from the PMT work branch to main or master.
- Reports complete, blocked, worker-review-complete, or escalation states to MM.

Worker:

- Works only from the assigned project root and branch.
- Opens PRs into the PMT work branch, not main or master.
- Provides validation evidence and exact changed-path summaries.
- Stops at assigned scope.

Researcher/Hermes:

- Supplies leads, proposals, receipts, and evidence.
- Does not authorize implementation by itself.
- Becomes actionable only through CStar bead/proposal lifecycle state.

CStar:

- Canonical authority for bead lifecycle, acceptance criteria, validation,
  result state, and closeout.
- MCP availability is part of workflow health. `Transport closed` blocks CStar
  lifecycle mutation unless an approved degraded fallback is explicitly named.

GitHub:

- Packaging and review layer for issues, branches, PRs, review comments, and
  merge organization.

CStar Console:

- Witness/control-room surface for CStar/GitHub gate integrity.
- Should flag source commits that lack a linked issue, branch, PR package, or
  declared local-exception follow-up decision.

## Escalation Gates

Green:

- State inspection, draft plans, low-risk docs/tests/tooling/source fixes, and
  local non-main branch work after CStar bead linkage.

Yellow:

- CStar/control-plane changes, automation behavior, agent authority, bead or
  proposal routing, security posture, large diffs, unclear ownership, or broad
  spoke impact. Pause for CoS review.

Red:

- Merge/main push, destructive cleanup, reset/history rewrite, production
  deploy/restart, secrets/config mutation, large binary/history changes, CStar
  authority model changes, or direct Hall/SQLite writes. CEO approval required.

Explicitly prohibited without operator approval:

- Direct main/master push.
- Merge to main/master.
- Destructive cleanup.
- Secret/config mutation.
- Deploy or restart.
- Direct Hall/SQLite writes.

## CStar Closeout

Closeout requires:

- The final packet states `GitHub workflow status:
  issue/branch/PR/local-exception/no-github-docs-only`.
- Worker PRs accepted or explicitly rejected with reason.
- PMT integration PR linked.
- Validation evidence linked and, when possible, recorded through
  cstar-kernel.
- CStar result state updated through cstar-kernel MCP when healthy.
- Any degraded MCP period backfilled through cstar-kernel after recovery.
- If a local commit exception was used, a follow-up GitHub packaging decision is
  linked or explicitly routed to MM.

Direct Hall/SQLite writes are not allowed when cstar-kernel primitives exist.
