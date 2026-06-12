# PMT GitHub Playbook

## Scope

This playbook is for project-scoped PMTs managing spoke code work through
GitHub while keeping CStar canonical. It describes issue, branch, worker PR,
integration PR, validation, and reporting behavior. It does not authorize live
GitHub creation, merge, push, or template rollout by itself.

This playbook is estate-wide for MM and all active PMTs. Project PMTs may add
project-specific commands, but every PMT must preserve this non-Actions
validation model.

## PMT Intake Checklist

Before assigning workers or opening GitHub work surfaces, confirm:

- CStar bead id exists and matches the intended work.
- Acceptance criteria are present and bounded.
- GitHub packaging mode is declared before edits: `PR_REQUIRED`,
  `LOCAL_EXCEPTION_WITH_FOLLOWUP_PR`, or `NO_GITHUB_DOCS_ONLY`.
- Project root and spoke are correct.
- Authority gate is Green, Yellow, or Red.
- Required approvals are known.
- Target paths are listed.
- Validation commands or evidence requirements are known.
- PMT work branch name follows `work/<bead-id>-<short-slug>`.
- Current MM thread id is verified from the latest routing order. Reject stale
  MM thread ids in boot packets and final report packets.
- GitHub Actions status is treated as optional/non-blocking unless a repo has a
  separately approved Actions-authoritative policy.

If a bead does not exist, stop and request CStar bead creation through
cstar-kernel MCP when healthy. Do not replace the bead with an issue, branch,
spreadsheet, chat note, or direct Hall/SQLite write.

If cstar-kernel MCP returns `Transport closed`, classify the work as yellow
blocked unless MM/CoS explicitly names an approved degraded fallback. The exact
failure text and backfill plan must appear in the PMT packet.

## GitHub Packaging Decision

PMT must decide one packaging mode before source edits:

- `PR_REQUIRED`: normal source implementation; create or route the GitHub issue,
  work branch, PR package, and integration path before closeout.
- `LOCAL_EXCEPTION_WITH_FOLLOWUP_PR`: scoped local commit is explicitly
  approved; closeout must automatically create or route a follow-up PR packaging
  decision packet.
- `NO_GITHUB_DOCS_ONLY`: docs/memory-only work; no source implementation files.

Branch/PR authority gates must become a concrete workflow decision before
source work starts. A local commit exception is not a substitute for that
decision.

## Non-Actions Validation Model

PMTs own local validation evidence. CStar owns validation/result ids. CStar
Console is the witness/control-room surface for receipts and status. GitHub
Actions are useful optional signal only; they are not the authority gate for
Corvus work unless a future repo opts in through explicit MM/CoS/CEO policy.
Existing Actions failures must be reported as advisory status, not used as a
validation blocker, unless that repo has separately opted into
Actions-authoritative gates.

Required PR validation fields:

```text
CStar bead id(s):
GitHub issue:
Packaging mode: PR_REQUIRED | LOCAL_EXCEPTION_WITH_FOLLOWUP_PR | NO_GITHUB_DOCS_ONLY
Branch:
Base branch:
Target branch:
Changed-file scope:
Local validation commands/results:
CStar validation result id(s):
PMT reviewer verdict:
MCP status/degraded fallback:
Risk notes:
Merge-gated statement:
GitHub Actions note: optional/non-blocking unless separately opted in
```

PMT final packets must include:

```text
GitHub workflow status:
MCP status:
Local validation evidence:
CStar result id(s):
Follow-up PR packaging decision:
PMT reviewer verdict:
Merge/main publication gate:
```

## Issue Setup

Issue title:

```text
[<bead-id>] <short actionable title>
```

Issue body fields:

```text
CStar bead id:
Spoke/project:
Project root:
PMT thread:
Owning PMT:
Authority gate:
Acceptance criteria:
Target paths:
PMT work branch:
Expected worker branches:
Required validation evidence:
Known risks:
Required approvals:
CStar closeout plan:
```

The issue must link back to the bead id and later link every worker PR,
integration PR, and validation result.

Required labels:

- `bead-linked`
- `PMT-work`
- `validation-needed` until evidence is accepted
- `blocked` when stalled
- `yellow-gate` or `red-gate` when the relevant escalation gate applies

## Branch Setup

PMT work branch:

```text
work/<bead-id>-<short-slug>
```

Worker branch:

```text
worker/<bead-id>/<worker-topic>
```

The PMT work branch is the integration surface for worker PRs. Workers do not
target main or master.

## Worker Assignment

Worker boot packets must include:

- CStar bead id.
- GitHub issue link.
- GitHub packaging mode.
- Current MM thread id.
- Stale-thread rejection rule.
- Base branch.
- PMT work branch.
- Worker branch name.
- PR target branch.
- Project root and cwd rule.
- Target paths.
- Acceptance criteria.
- Exact validation commands.
- Expected artifacts/evidence.
- Escalation class: Green, Yellow, or Red.
- Prohibited actions.
- Required PR body fields.
- Link to `docs/operations/worker-github-playbook.md`.
- Stop condition and report format.
- Explicit text: `Do not merge or push to main/master.`
- Explicit text: `Reject stale MM thread ids; report only to the current MM
  thread named in this packet.`

Workers run fresh, project-scoped, low-reasoning threads unless MM/CoS explicitly
approves otherwise.

## PMT Review Packet

When reviewing a worker PR, the PMT review packet must include:

```text
CStar bead id:
GitHub issue:
Worker PR:
Worker branch:
PMT work branch:
Changed paths reviewed:
Acceptance criteria reviewed:
Validation commands reviewed:
Validation evidence:
Artifacts/evidence links:
Labels checked:
Escalation class:
Decision: accept into work branch | return to worker | block/escalate
Required follow-up:
CStar result or validation id:
GitHub workflow status:
Current MM thread id verified:
```

The review packet is required before accepting the worker PR into the PMT work
branch.

## Worker PR Acceptance

The PMT may accept a worker PR into the PMT work branch only after:

- PR title and body contain the exact bead id.
- PR targets the PMT work branch.
- PR labels include `bead-linked`, `worker-PR`, and `validation-needed` until
  evidence is accepted.
- Changed paths match assignment scope.
- Validation evidence is present or a justified gap is explicit.
- No red action is hidden in the diff.
- Remaining risks are documented.

If the worker PR fails scope, validation, or authority checks, return it to the
worker with exact review comments or mark it blocked for MM/CoS escalation.

## PMT Integration PR

The PMT integration PR packages the PMT work branch for main or master review.

Integration PR title:

```text
[<bead-id>] PMT integration: <short-slug>
```

Integration PR body fields:

```text
CStar bead id:
GitHub issue:
PMT work branch:
Target branch:
Worker PRs included:
Acceptance criteria covered:
Validation evidence:
CStar result or validation id:
Remaining risks:
Required CoS/CEO approvals:
GitHub workflow status:
```

Required labels:

- `bead-linked`
- `PMT-work`
- `integration-PR`
- `validation-needed` until evidence is accepted
- `yellow-gate` or `red-gate` when the relevant escalation gate applies

Do not merge the integration PR into main or master without validation evidence
and the required CoS/CEO gate.

## PMT Reporting

Report to MM after:

- Bootstrap/readiness completion.
- Worker review completion.
- Blocked state.
- Escalation-worthy condition.
- Integration PR readiness.
- CStar closeout completion.

Do not assume MM polling. Use direct thread send when exposed. If unavailable,
end the turn with an `MM_REPORT_PENDING` packet containing the same report.

The PMT final packet must include:

```text
GitHub workflow status: issue/branch/PR/local-exception/no-github-docs-only
Current MM thread id verified:
MCP status: healthy | Transport closed | degraded fallback named
Follow-up PR packaging decision needed: yes | no
```

Report only to the current MM thread id from the latest MM routing order. If the
PMT board or memory points to a different MM thread, treat that as stale memory,
update the local PMT memory surface if authorized, and report the correction.

## CStar Result Closeout

Before closeout, the PMT must ensure:

- The bead, issue, worker PRs, integration PR, and validation evidence link to
  each other.
- Validation is recorded through cstar-kernel MCP when healthy.
- Any degraded state has exact failure text and a backfill plan.
- Main/master merge remains gated until CoS/CEO approval where required.
- Local commit exceptions have a routed follow-up PR packaging decision packet.
- Source commits without a linked issue/branch/PR package are visible to CStar
  Console witness/control-room requirements as gate exceptions.

No direct Hall/SQLite writes are allowed.

## Explicit Prohibited Actions

Without explicit operator approval, the PMT must not:

- Push directly to main or master.
- Merge to main or master.
- Perform destructive cleanup.
- Mutate secrets or config.
- Deploy or restart.
- Direct-write Hall/SQLite.
- Roll out GitHub issues, PRs, or templates across spokes beyond the routed
  scope.
