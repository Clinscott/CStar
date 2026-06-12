# PMT Board - CStar Hub

## Identity
- PMT thread: 019e92ea-f551-7d50-928e-f67f6253ee36
- Source MM thread: 019e8a7f-abea-7972-9e5f-67e5638c8bb5
- Current successor MM thread: 019ea47d-dcbb-7f63-94ee-5bcc51fe87fd
- Project root: /home/morderith/Corvus/CStar
- Scope: CStar hub/control-plane only
- Canonical bead: pmt-cstar-hub-control-plane

## Routing Boundary
- CoS owns CEO-facing priorities, risks, and approvals.
- MM owns thread architecture, PMT creation/routing, and duplicate-work control.
- This PMT owns CStar project execution tracking and worker assignment only.
- Workers issued by this PMT must run in /home/morderith/Corvus/CStar unless explicitly approved otherwise.
- Researcher thread 019e5287-afcc-71b2-a8dc-beac4995f5cc is a monitored pipeline, not a normal PMT worker.

## Standing Corvus Pipeline Policy
- CStar is canonical for Corvus planning, proposals, execution state, validation, and completion.
- Default route: CoS -> Corvus - MM -> one pinned project-scoped PMT -> fresh project-scoped workers.
- CoS owns CEO-facing coordination, priorities, risks, approvals, and visibility. CoS issues orders to MM and waits for reports; no continuous downstream watching unless CEO asks or escalation arrives.
- MM runs gpt-5.5 high, owns thread architecture and the project-to-PMT routing map, routes orders to PMTs, starts PMT bootstraps/work serially when rate limits matter, and does not continuously watch PMTs/workers.
- PMTs run gpt-5.5 medium, are pinned/project-specific/project-root scoped, maintain project understanding/readiness memory, own execution tracking, assign fresh workers, and periodically watch only workers they issued at bounded cadence.
- Workers and work threads run gpt-5.5 low, are fresh and project-scoped, and must receive/persist project pipeline behavior before implementation when a local memory surface exists.
- Operator gates: no commit, push, post, merge, delete, restart, deploy, secret/config mutation, direct Hall/SQLite write, acceptance, dispatch, or implementation bypass without explicit approval.
- If cstar-kernel MCP is unavailable, report exact failure and use only sanctioned shell fallback where exposed; never bypass into private Hall/SQLite state.

## CStar PMT Behavior Memory
- Project/spoke: CStar hub/control-plane.
- PMT model/reasoning policy: gpt-5.5 medium.
- Worker model/reasoning policy: gpt-5.5 low.
- Worker cwd rule: /home/morderith/Corvus/CStar unless MM/CoS explicitly approves an exception.
- CStar/bead rule: use cstar-kernel MCP for bead lifecycle and control-plane state when healthy; no direct Hall/SQLite writes; backfill via cstar-kernel after degraded recovery.
- Reporting rule: proactively report to the current successor MM thread 019ea47d-dcbb-7f63-94ee-5bcc51fe87fd after memory write completion, blocked state, worker review completion, or escalation-worthy condition. Do not assume MM polling.
- Active MM id verification rule: before every PMT final packet, compare the destination thread against the latest MM routing order. If older PMT memory names a different MM thread, treat it as stale and do not report there unless the latest order explicitly says to.
- Bootstrap context: hub/control-plane scope only; PMT board path /home/morderith/Corvus/CStar/work/pmt-board.md; bead pmt-cstar-hub-control-plane; validation val-1780581539681-2g8nz; cstar-kernel doctor was healthy score 100 at bootstrap.
- Worktree context: CStar worktree was already dirty before PMT bootstrap; PMT only added this isolated board file.

## GitHub Workflow Doctrine Adoption
- Canonical docs:
  - /home/morderith/Corvus/CStar/docs/operations/spoke-github-workflow.md
  - /home/morderith/Corvus/CStar/docs/operations/pmt-github-playbook.md
  - /home/morderith/Corvus/CStar/docs/operations/worker-github-playbook.md
  - /home/morderith/Corvus/CStar/docs/operations/cstar-console-witness-control-room-requirements.md
  - /home/morderith/Corvus/CStar/.github/pull_request_template.md
  - /home/morderith/Corvus/CStar/.github/cstar-local-validation-receipt.md
- Doctrine bead: bead-spoke-github-workflow-doctrine is READY_FOR_REVIEW, not RESOLVED.
- Repo/root: /home/morderith/Corvus/CStar.
- Default protected branch: master, inferred from read-only git state (`git branch --show-current` -> master; `refs/remotes/origin/HEAD` -> origin/master).
- PMT work branch convention: work/<bead-id>-<short-slug>.
- Worker branch convention: worker/<bead-id>/<worker-topic>.
- Canonical labels: bead-linked, PMT-work, worker-PR, integration-PR, validation-needed, blocked, yellow-gate, red-gate.
- CStar docs/control-plane validation commands:
  - Focused docs/content check: rtk rg -n "<required doctrine terms>" docs/operations/spoke-github-workflow.md docs/operations/pmt-github-playbook.md docs/operations/worker-github-playbook.md.
  - Scope check: rtk git status --short <approved paths>.
  - Node/control-plane check when TypeScript/kernel behavior changes: rtk npm run test:node.
  - Full suite when broad CStar behavior changes: rtk npm test.
  - Distribution/plugin check when packaging or generated plugin guidance changes: rtk npm run build:distributions and rtk npm run validate:distributions.
  - Markdown/doc-specific lint: TBD; discover via package scripts or repo docs before claiming it exists.
- Escalation rules:
  - CoS owns CEO-facing priorities, risks, approvals, and visibility.
  - MM owns thread architecture, PMT routing, serial PMT hardening, and duplicate-work control.
  - PMT owns CStar project execution tracking, worker assignment, worker PR review, PMT integration packaging, and proactive MM reports.
  - Workers own bounded project-scoped execution and PR/evidence packets only.
  - Green: state inspection, draft plans, proposed diffs, low-risk docs/tests/tooling/source fixes, and local non-main branch work after CStar bead linkage.
  - Yellow: CStar/control-plane changes, automation behavior, agent authority, bead/proposal routing, security posture, large diffs, unclear ownership, or broad spoke impact. Pause for CoS review.
  - Red: direct main/master push, merge, destructive cleanup, reset/history rewrite, deploy/restart, secrets/config mutation, large binary/history changes, CStar authority model changes, direct Hall/SQLite writes, or main/master publication. CEO approval required.
- Worker boot packet template:
  ```text
  CStar bead id:
  GitHub issue link:
  GitHub packaging mode: PR_REQUIRED | LOCAL_EXCEPTION_WITH_FOLLOWUP_PR | NO_GITHUB_DOCS_ONLY
  Current MM thread id: 019ea47d-dcbb-7f63-94ee-5bcc51fe87fd
  Stale-thread rejection rule: reject any older MM thread id unless latest MM routing order explicitly names it
  Base branch:
  Worker branch name: worker/<bead-id>/<worker-topic>
  PR target branch: work/<bead-id>-<short-slug>
  Project root: /home/morderith/Corvus/CStar
  Worker cwd: /home/morderith/Corvus/CStar
  Exact validation commands:
  Expected artifacts/evidence:
  Escalation class: Green | Yellow | Red
  Worker playbook: /home/morderith/Corvus/CStar/docs/operations/worker-github-playbook.md
  Required instruction: Do not merge or push to main/master.
  Required instruction: Reject stale MM thread ids; report only to the current MM thread named in this packet.
  ```
- CStar closeout rule: validation/result state must be recorded through cstar-kernel MCP where available; no direct Hall/SQLite bypass. If cstar-kernel is degraded, report exact failure, use sanctioned fallback only where exposed, and backfill through cstar-kernel after recovery.
- Live-work boundary: this PMT must not create GitHub issues/PRs/templates, roll doctrine out across spokes, or execute live spoke implementation unless explicitly routed by MM/CoS.

## Estate Non-Actions GitHub Validation - 2026-06-08
- Bead anchor: bead-github-non-actions-validation-workflow.
- Estate operationalization bead: bead-estate-github-workflow-operationalization.
- Scope: estate-wide for MM and all active PMTs, with CStar owning canonical docs/templates first.
- Doctrine: GitHub is the issue/branch/PR/review ledger. GitHub Actions are optional and non-blocking by default, and they are not the authority gate unless a future repo opts in through a separate approved policy.
- Validation authority: PMT local validation evidence + CStar validation/result ids + CStar Console witness receipts/status.
- Required source-work intake mode: PR_REQUIRED | LOCAL_EXCEPTION_WITH_FOLLOWUP_PR | NO_GITHUB_DOCS_ONLY.
- PMT final packets must include GitHub workflow status, MCP status, local validation evidence, CStar result id(s), and follow-up PR packaging decision when a local exception was used.
- Worker boot packets must include current MM thread id, stale-thread rejection rule, bead id, issue link if present, branch/base/target, validation commands, packaging mode, and no-main/no-merge gates.
- Merge/main publication remains separately gated.
- Rollout boundary: do not update other PMT memories from this CStar PMT. Return canonical package to successor MM, then MM may route serial PMT hardening.

## GitHub Workflow Failure Hardening - 2026-06-08
- Incident anchor: bead-cstar-spoke-metadata-upsert-repair; local commit fc4b482ac4c38fef0bf55efd53d4dbb53d604553 (`fix: clarify spoke metadata identity`).
- Required first finding: cstar-kernel MCP transport closed during the workflow. MCP `Transport closed` is a yellow blocker unless an approved degraded fallback is explicitly named.
- RCA findings:
  - No GitHub issue, PMT work branch, or PR package was created before the local source commit.
  - The local-commit exception was authorized, but the workflow did not automatically create a follow-up PR-packaging gate.
  - PMT initially reported to old MM thread 019e8a7f-abea-7972-9e5f-67e5638c8bb5 instead of successor MM 019ea47d-dcbb-7f63-94ee-5bcc51fe87fd.
  - MCP Transport closed interrupted final CStar result recording and after-proof.
  - Dirty CStar worktree and untracked doctrine docs made scoped commit packaging harder.
  - Branch/PR authority gates were not translated into a concrete GitHub packaging decision before source work.
- Hardening controls:
  - Every source-code implementation bead must declare GitHub packaging mode before edits: PR_REQUIRED, LOCAL_EXCEPTION_WITH_FOLLOWUP_PR, or NO_GITHUB_DOCS_ONLY.
  - If local commit is allowed, closeout must route a follow-up PR packaging decision packet.
  - PMT/worker boot packets must include current MM thread id and stale-thread rejection rule.
  - PMT final packets must include `GitHub workflow status: issue/branch/PR/local-exception/no-github-docs-only`.
  - CStar Console witness requirements should flag source commits without linked issue/branch/PR package or declared local-exception follow-up.
- Decision for fc4b482a: needs a GitHub issue/branch/PR packaging bead or explicit no-PR closure decision from MM/CoS. Recommended mode: LOCAL_EXCEPTION_WITH_FOLLOWUP_PR.

## Hermes Researcher And MiniMax SwarmForge Doctrine Memory
- Canonical docs:
  - /home/morderith/Corvus/CStar/docs/operations/hermes-researcher-swarmforge-operating-doctrine.md
  - /home/morderith/Corvus/CStar/docs/operations/hermes-swarmforge-pr-gates.md
  - /home/morderith/Corvus/CStar/docs/operations/cstar-console-witness-control-room-requirements.md
  - Existing GitHub workflow doctrine docs under /home/morderith/Corvus/CStar/docs/operations/ remain relevant for bead -> issue -> branch -> PR -> validation -> closeout discipline.
- Bead anchors:
  - bead-hermes-researcher-swarmforge-operating-doctrine: READY_FOR_REVIEW.
  - bead-estate-swarmforge-repo-readiness: OPEN.
- Project root: /home/morderith/Corvus/CStar.
- PMT id: 019e92ea-f551-7d50-928e-f67f6253ee36.
- Default/protected branch: master, inferred from read-only git state (`git branch --show-current` -> master; `refs/remotes/origin/HEAD` -> origin/master).
- Branch discipline:
  - PMT work branch: work/<bead-id>-<short-slug>.
  - Worker branch: worker/<bead-id>/<worker-topic>.
  - No direct main/master work; worker PRs target PMT work branches; PMT integration PRs target main/master only after validation and required gates.
- GitHub issue/PR discipline:
  - No issue, branch, or PR without a linked CStar bead id.
  - No duplicate active bead/issue/branch/PR for the same work.
  - Scope must match CStar acceptance criteria.
  - Required labels stay aligned with GitHub doctrine: bead-linked, PMT-work, worker-PR, integration-PR, validation-needed, blocked, yellow-gate, red-gate.
- CStar docs/control-plane validation guidance:
  - Focused docs/content check: rtk rg -n "<required doctrine terms>" <approved docs>.
  - Scope check: rtk git status --short <approved paths>.
  - Node/control-plane check when TypeScript/kernel behavior changes: rtk npm run test:node.
  - Full suite when broad CStar behavior changes: rtk npm test.
  - Distribution/plugin check when packaging or generated plugin guidance changes: rtk npm run build:distributions and rtk npm run validate:distributions.
  - Markdown/doc-specific lint remains TBD; discover via package scripts or repo docs before claiming it exists.
- PMT PR review expectations and hard PR gates:
  - Linked CStar bead and GitHub issue.
  - Duplicate active work check.
  - Scope matches acceptance criteria.
  - Correct source and target branch.
  - Tests/build/lint pass or failures/skips are explained with exact commands/results.
  - Regression risk checked.
  - No secret/config mutation without approval.
  - No deploy/restart/main publication.
  - No direct Hall/SQLite lifecycle bypass.
  - Generated/binary/history risk classified.
  - Security/dependency/license changes classified.
  - UI proof attached when relevant.
  - Receipt includes changed files, commits, checks, risks, and PMT verdict.
- Worker or SwarmForge boot packet requirements:
  ```text
  CStar bead id:
  GitHub issue link:
  Base branch:
  Worker branch name:
  PR target branch:
  Project root:
  Worker cwd:
  Exact validation commands:
  Expected artifacts/evidence:
  Escalation class: Green | Yellow | Red
  Worker playbook:
  Required instruction: Do not merge or push to main/master.
  ```
- Researcher/Hermes exception:
  - Researcher researches, synthesizes proposals, gathers evidence, detects duplicates, and discovers opportunities.
  - Hermes MiniMax SwarmForge implements only after accepted work is staged and separately dispatched.
  - Agy/Codex are gates and reviewers by default, not implementation defaults.
  - If Hermes/MiniMax or SwarmForge fails, do not silently fall back to Agy/Codex implementation. Record the exact failure and escalate.
- Green/yellow/red gates:
  - Green: read-only inspection, draft plans, proposed diffs, low-risk docs/tests/tooling/source fixes, and local non-main branch work after CStar bead linkage.
  - Yellow: CStar/control-plane changes, automation behavior, agent authority, bead/proposal routing, security posture, large diffs, unclear ownership, broad spoke impact, dependency/license/security risk, or generated/binary/history risk that is not clearly low-risk. Pause for CoS review.
  - Red: direct main/master push, merge, destructive cleanup, deploy/restart, secrets/config mutation, direct Hall/SQLite write, main/master publication, CStar authority model change, branch protection change, or live SwarmForge/GitHub rollout. CEO approval required.
- Project-specific SwarmForge readiness blockers for CStar:
  - Doctrine docs are local and uncommitted/unpushed.
  - bead-hermes-researcher-swarmforge-operating-doctrine is READY_FOR_REVIEW, not RESOLVED.
  - Prior GitHub workflow docs under docs/operations are still untracked from doctrine setup.
  - No broad rollout has been performed.
- Reporting rule: this PMT proactively reports READY, BLOCKED, ESCALATION, or COMPLETE to MM thread 019e8a7f-abea-7972-9e5f-67e5638c8bb5. MM should not poll continuously.
- Prohibited without explicit routing/approval: implementation, commit, push, PR creation, merge, main/master publication, deploy, restart, delete, destructive cleanup, secrets/config mutation, direct Hall/SQLite writes, live Researcher dispatch, live SwarmForge implementation, GitHub rollout, branch protection change, or broad repo mutation.

## HoD Specialist Worker Architecture Phase 2
- Status: PHASE_2_DOCS_MEMORY_IMPLEMENTED_PENDING_REVIEW.
- Anchor bead: bead-corvus-hod-specialist-worker-architecture, IN_PROGRESS at intake.
- Approved docs:
  - /home/morderith/Corvus/CStar/docs/operations/corvus-hod-specialist-worker-architecture.md
  - /home/morderith/Corvus/CStar/docs/operations/pmt-hod-playbook.md
- Approved route: CoS -> MM -> PMT -> HoD -> specialist fresh workers -> HoD -> PMT -> MM -> CoS.
- PMT remains project manager and final integrator; HoDs are department standards/review/routing surfaces, not mini-PMTs.
- HoDs are event-triggered, not always-on chatty departments.
- PMTs may direct-route simple green work when scope is narrow and validation is clear.
- Estate HoD taxonomy is recorded in corvus-hod-specialist-worker-architecture.md.
- Per-project HoD map is recorded in corvus-hod-specialist-worker-architecture.md, including CStar and XO pilot mapping.
- CStar HoD set: Kernel & Control-Plane; Console Witness & Operations UI; Doctrine/GitHub Workflow; optional Security/Risk.
- XO pilot first wave: Guardian & Session Authority; Runtime Data & Evidence; Validation & Release Readiness; Learning & Curriculum Safety included for pilot evaluation because XO's first-stage product intent is tutoring/educational aid for CEO's children; Guardian UI deferred unless volume justifies it.
- Yellow-by-default classes: XO child-safety/guardian/session/learning/curriculum/evidence; SecureSphere/CorvusEye security/native/forensics; CStar control-plane; cstar-console witness/gates; Moonshot CAD/simulation; AuguryTokenPath token evidence.
- Specialist worker profile names are names only for now. Profile prompts are next phase and not approved by this memory entry.
- Reporting: HoD reports summarized READY/BLOCKED/ESCALATION to PMT; PMT batches upward to MM; CoS receives material exceptions/status.
- Prohibited: no HoD thread creation, no specialist profile prompts beyond names, no worker creation beyond explicitly bounded docs/validation helper, no GitHub issue/branch/PR, push, merge, deploy, restart, destructive cleanup, secrets/config mutation, direct Hall/SQLite write, live dispatch, or main/master publication without explicit scope/approval.

## HoD Specialist Worker Architecture Phase 3
- Status: PHASE_3_XO_PROFILE_DOCS_IMPLEMENTED_PENDING_REVIEW.
- Anchor bead: bead-corvus-hod-specialist-worker-architecture, IN_PROGRESS at intake for Phase 3.
- Canonical XO HoD profile prompt docs:
  - /home/morderith/Corvus/CStar/docs/operations/hod-profiles/xo-guardian-session-authority.md
  - /home/morderith/Corvus/CStar/docs/operations/hod-profiles/xo-runtime-data-evidence.md
  - /home/morderith/Corvus/CStar/docs/operations/hod-profiles/xo-validation-release-readiness.md
  - /home/morderith/Corvus/CStar/docs/operations/hod-profiles/xo-learning-curriculum-safety.md
- Canonical XO specialist worker profile skeleton doc:
  - /home/morderith/Corvus/CStar/docs/operations/worker-profiles/xo-specialist-worker-profiles.md
- Phase 3 scope: prompt/profile drafting only for XO pilot lanes.
- First-stage XO product intent: tutor and educational aid for CEO's children.
- Yellow-by-default XO surfaces: child-safety, guardian control, session authority, learning/curriculum boundaries, evidence integrity, and age-appropriate tutoring.
- HoDs are not mini-PMTs; PMT remains project manager and final integrator.
- Direct-route rule remains: PMT may bypass HoD only for simple green work with narrow scope, known validation, and no yellow/red class.
- Worker profile skeletons are future boot surfaces only; no worker creation, durable HoD thread, product implementation, GitHub artifact, live dispatch, or release authority is granted.

## Authority Gates
- Green: state inspection, worker assignment, draft plans, proposed diffs, low-risk docs/tests/tooling/source fixes, and local non-main commits only when policy allows and verification passes.
- Yellow: CStar/control-plane changes, automation behavior, agent authority, bead/proposal routing, security posture, large diffs, or unclear ownership. Pause for CoS review.
- Red: merge/main push, destructive cleanup, reset/history rewrite, production deploy/restart, secrets/config mutation, large binary/history changes, or CStar authority model changes. CEO approval required.

## Current State
- Status: IDLE_WAITING_FOR_MM_OR_COS_ROUTE
- Kernel MCP: healthy at PMT establishment; doctor score 100.
- Thread state: PMT thread pinned.
- Implementation started: no.
- Worker assignments: none active.
- Existing worktree condition: dirty before PMT board creation; do not revert unrelated changes.

## Queue
| Item | Status | Owner | Notes |
| --- | --- | --- | --- |
| PMT establishment | SET | PMT - CStar | Bead created and board initialized. |
