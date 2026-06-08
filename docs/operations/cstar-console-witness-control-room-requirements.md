# CStar Console Witness And Control Room Requirements

## Purpose

CStar Console is the operational witness and control room for the Corvus
execution system. It must show the relationship between CStar authority, GitHub
packaging, Hermes Researcher proposals, Hermes MiniMax SwarmForge receipts, PMT
review, MM routing, CoS exceptions, and CEO red gates.

CStar Console is not merely the project surface for the `cstar-console` PMT.

## Witness Scope

CStar Console must make these states visible:

- CStar bead id, status, acceptance criteria, owner, and closeout state.
- Researcher proposal status, evidence, duplicate detection, and opportunity
  source.
- GitHub issue, worker branches, worker PRs, PMT work branch, and integration
  PR.
- GitHub checks and review status.
- Hermes MiniMax SwarmForge dispatch packet and receipt.
- Changed files, commits, validation commands, and check results.
- Local PMT validation receipts, CStar validation/result ids, and any GitHub
  Actions status as separate fields.
- Generated/binary/history risk classification.
- Security/dependency/license classification.
- UI proof when relevant.
- PMT verdict.
- MM routing state.
- CoS yellow/red exception state.
- CEO red-action approval state.
- CStar validation/result id.

## Non-Actions Validation Witness

CStar Console must show that GitHub is the issue, branch, PR, and review ledger
while CStar remains the validation authority. GitHub Actions are optional and
non-blocking by default. The console must not present Actions as the approval
gate unless a repo has an explicit approved opt-in policy.

The witness surface should track:

- PMT local validation commands and results.
- CStar validation/result id or ids.
- CStar MCP status and approved degraded fallback, if any.
- PMT reviewer verdict.
- GitHub Actions status as advisory, optional, non-blocking signal.
- Merge/main publication gate status.
- CStar Console receipt/status link when available.

If Actions are missing, skipped, failing, or unavailable, the console should
still allow PMT/CStar validation evidence to be recorded and reviewed. It should
flag missing local validation evidence or missing CStar result ids as
`validation-needed`.

## Required Control Room Views

Bead Work Item View:

- Bead status and acceptance criteria.
- Linked GitHub issue.
- Linked worker PRs and integration PR.
- Linked Researcher proposal and SwarmForge receipt.
- Duplicate-work warning state.
- Validation and closeout state.

PR Gate View:

- Hard gate checklist status.
- Missing or failed gate reason.
- PMT verdict and reviewer.
- Required CoS/CEO action.
- No direct main/master work indicator.

Researcher Pipeline View:

- Daily research freshness.
- Proposal synthesis state.
- Duplicate detection result.
- Evidence and receipts.
- Whether the proposal is actionable or only a lead.

SwarmForge Receipt View:

- Dispatch packet path/checksum.
- Hermes profile/model/provider.
- Calls/tokens when available.
- Changed files and commits.
- Checks and failures.
- Risk classifications.
- PMT verdict.

Exception View:

- Yellow gate requests awaiting CoS.
- Red gate requests awaiting CEO.
- Expiration/follow-up condition.
- Validation impact.

## Ingestion Requirements

CStar Console should ingest or reconcile:

- CStar bead lifecycle state through cstar-kernel.
- GitHub issue/PR/check state through approved GitHub surfaces.
- Local validation receipts and PR templates through approved GitHub surfaces.
- Researcher proposal and evidence artifacts.
- Hermes SwarmForge receipts.
- PMT review packets.
- MM routing packets.
- CoS/CEO exception decisions.

Direct Hall/SQLite lifecycle bypass is prohibited. If cstar-kernel is degraded,
the console must show exact degraded state and avoid pretending lifecycle state
was updated.

## UI States

Required UI states:

- `not-linked`: missing bead, issue, PR, or receipt link.
- `duplicate-risk`: duplicate active work detected.
- `validation-needed`: checks absent, stale, failed, or not reviewed.
- `pmt-review`: awaiting PMT verdict.
- `yellow-gate`: CoS decision required.
- `red-gate`: CEO decision required.
- `ready-for-integration`: PMT work branch ready for integration PR review.
- `blocked`: explicit blocker present.
- `closed-out`: CStar validation/result state recorded.

## Non-Goals

CStar Console requirements do not authorize:

- Live GitHub issue/PR/template rollout.
- Live SwarmForge dispatch.
- Main/master merge.
- Deploy or restart.
- Direct Hall/SQLite writes.
- Secret/config mutation.
- Cross-spoke implementation.

Those actions require explicit routing and the relevant operator gate.
