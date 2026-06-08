# Worker GitHub Playbook

## Scope

This playbook is for fresh project-scoped worker threads assigned by a PMT.
Workers package implementation or review work through GitHub while CStar remains
canonical for authority, acceptance criteria, validation, and closeout.

Workers do not create authority. Workers execute bounded assignments.

Validation authority does not come from GitHub Actions by default. Workers must
return local validation evidence for PMT review; PMTs and CStar record the
authoritative validation/result state.

## Required Boot Packet

Every worker must receive:

```text
CStar bead id:
GitHub issue:
GitHub packaging mode:
GitHub Actions authority: optional/non-blocking unless separately opted in
Project root:
Worker cwd:
PMT thread:
Current MM thread id:
Base branch:
PMT work branch:
Required worker branch:
PR target branch:
Target paths:
Acceptance criteria:
Exact validation commands:
Expected artifacts/evidence:
Authority gate:
Escalation class:
Prohibited actions:
PR title format:
PR body fields:
Worker playbook: docs/operations/worker-github-playbook.md
Stop condition:
Report destination:
Stale-thread rejection rule:
```

If the boot packet lacks a bead id, branch rule, project root, acceptance
criteria, or prohibited actions, the worker must stop and ask PMT for a corrected
packet.

The boot packet must include this exact instruction:

```text
Do not merge or push to main/master.
```

The boot packet must also include this exact instruction:

```text
Reject stale MM thread ids; report only to the current MM thread named in this packet.
```

## Branch Rule

Worker branch:

```text
worker/<bead-id>/<worker-topic>
```

The worker branch must be rooted in the assigned project. It must not target
main or master. Its PR target is the PMT work branch:

```text
work/<bead-id>-<short-slug>
```

## PR Rule

Worker PR title:

```text
[<bead-id>] <worker-topic> -> <pmt-work-branch>
```

Worker PR body fields:

```text
CStar bead id:
GitHub issue:
Source branch:
Target branch:
Role: worker PR
Changed paths:
Acceptance criteria covered:
Validation evidence:
CStar validation result id:
GitHub Actions note: optional/non-blocking unless separately opted in
Remaining risks:
Required approvals:
GitHub workflow status:
```

Required worker PR labels:

- `bead-linked`
- `worker-PR`
- `validation-needed` until evidence is accepted
- `blocked` when stalled
- `yellow-gate` or `red-gate` when the relevant escalation gate applies

No PR may omit the bead id. If validation is incomplete, the PR must state why,
what was run, what failed or was unavailable, and what evidence is still needed.

## Worker Responsibilities

Workers must:

- Stay within assigned target paths and project root.
- Preserve the bead -> issue -> branch -> PR chain.
- Preserve the declared GitHub packaging mode.
- Keep commits and PR scope bounded to the assignment if commits are authorized.
- Report exact validation commands and results.
- Report whether GitHub Actions are absent, skipped, failing, or passing as
  advisory status only unless the boot packet says the repo has opted into
  Actions-authoritative gates.
- Report changed paths and risk notes.
- Stop before red actions or unclear authority.

Workers must not:

- Merge to main or master.
- Push directly to main or master.
- Push or publish unless explicitly authorized by PMT/CoS/CEO policy for the
  assignment.
- Create GitHub issues or templates unless the PMT explicitly assigns that
  setup work.
- Mutate secrets/config.
- Deploy, restart, delete, reset history, or run destructive cleanup.
- Direct-write Hall/SQLite.
- Bypass CStar bead lifecycle.

## Validation Evidence

Validation evidence should include:

- Command names and pass/fail results.
- Test, build, lint, typecheck, smoke, browser, or artifact proof as assigned.
- Known skipped checks and exact reason.
- Any generated validation id or CStar result id when provided by the PMT.

Validation evidence must be linkable from the worker PR and later from the PMT
integration PR and CStar closeout.

## Escalation

Escalate to PMT when:

- The bead id, branch, issue, or acceptance criteria are missing or conflicting.
- The GitHub packaging mode is missing or conflicts with the assignment.
- The MM thread id is missing, stale, or conflicts with the latest PMT packet.
- The assignment requires a yellow or red action not already approved.
- The diff grows beyond assigned scope.
- Validation fails and the fix is not obvious within scope.
- The worker detects secret/config risk, destructive action, direct Hall/SQLite
  pressure, or main/master publication pressure.
- CStar MCP returns `Transport closed` and no approved degraded fallback is
  named in the boot packet.

Worker output should end with: status, changed paths, validation evidence,
risks, PR link or draft body, and requested PMT action.
