# CStar Goal-Driven and Daily Bootstrap

This runbook keeps a non-trivial CStar mission continuous across long turns,
thread interruption, subagent work, and daily toolchain changes. `AGENTS.md`
points here instead of duplicating the procedure.

## 1. Start or resume the host goal

Before a non-trivial bead, multi-file change, Forge/Researcher request, or
resumed mission:

1. Read the current host goal.
2. If no unfinished goal exists, create one objective that states the durable
   outcome, lifecycle closeout, and operator gates. Do not set an artificial
   token budget unless the operator requested one.
3. If the goal is active, continue it. If it is blocked and the operator
   explicitly resumes it, use the supported resume transition without changing
   the objective or usage history.
4. If the host exposes no resume transition, do not invent one or replace the
   goal. Anchor the defect to a CStar repair bead, then use
   `cstar_goal_resume` from the canonical root-user turn.
   This appends a `cstar.host_goal_resume.v1` decision event containing only
   bounded hashes and lifecycle references. It is a continuity-only overlay:
   the host status remains `blocked`, no host object is mutated, and it grants
   no spend, source, Git, installation, restart, deployment, or production
   authority. Continue the unchanged objective only after that explicit signal
   verifies and the event persists. The signal must be a dedicated, fully
   anchored imperative or authorization statement. Questions, quotations,
   examples, button-label prose, and incidental mentions of resuming a goal do
   not qualify.
5. Maintain a short plan with at most one in-progress step. Put the relevant
   bead or decision ids in the plan/explanation when the host supports it.

Mark a goal complete only after the requested outcome, focused validation,
independent review where required, CStar result recording, and closeout are all
done. Mark it blocked only when the host's blocked threshold is actually met;
a red gate or failed attempt is a problem to diagnose, plan, and persist, not a
reason to abandon the mission.

## 2. Route each bounded subtask

Use the narrowest capable lane:

- **Corvus Forge / Hermes MiniMax-M3** for implementation when the Forge lane
  applies. Request is no-spend; execute consumes the authorized attempt.
- **Researcher / Hermes** for authorized research and evidence gathering.
- **Codex subagent** for bounded analysis, inspection, tests, or independent
  review. A subagent is not Forge implementation.
- **CoS bootstrap repair** only when the canonical CStar/Forge boundary itself
  is broken and the Forge runbook permits the exception.

Partition agents by independent files or review questions. Avoid concurrent
edits to the same file. Ask the host for the task-appropriate current GPT-5.6
profile only when it exposes an enforceable selector:

- Luna for routine bounded retrieval and mechanical validation.
- Terra for conflicting-context synthesis and contract integration.
- Sol for security, architecture, authority, and incident forensics.

Every worker packet records `requested_model`, `requested_reasoning`,
`actual_model`, and `model_source`. If the runtime does not report actual
identity, record `actual_model: null` and `model_source: unreported`; never infer
it from the provider, task name, or prompt.

## 3. First-task-of-day freshness

Run this once per local calendar day before the first CStar mutation or provider
attempt. Store a bounded receipt outside source (for example under
`work/receipts/daily-bootstrap/YYYY-MM-DD.json`). The receipt contains only
commands, exit status, before/after versions, dirty/active-process gates,
update result, and any restart requirement. It contains no environment dump,
credential data, token, or auth path.

1. Run `codex --version`, `hermes --version`, and `hermes update --check`.
2. Confirm there is no active Forge/provider attempt and no goal step that an
   updater could interrupt.
3. Before `hermes update`, prove its checkout is clean, including untracked
   nested repositories. Do not trust auto-stash as proof: the updater must show
   that a new stash was created when needed and that no dirty path remains.
   A dirty checkout is a hard update-window failure. Do not stash, reset,
   clean, switch branches, relocate a nested repository, or force the update
   without a separately bounded repair. Record the repair item instead.
4. The operator's standing daily instruction authorizes `codex update` and a
   clean-window `hermes update --backup --yes`. It does not authorize a
   restart, destructive cleanup, profile/credential mutation, or bypassing an
   active attempt.
5. Record the after versions and updater result. For a Git-backed Hermes
   install, compare `HEAD` with the fetched update ref; do not treat a cached
   banner count as update proof. If Codex or a plugin requires
   a restart, stop at the restart gate and request/consume explicit restart
   authority; source freshness is not live-runtime proof.

A successful receipt closes the freshness requirement for that local calendar
day. Do not rerun Hermes or Codex update checks merely because upstream advances
again later the same day; that drift is informational, not a red gate. Reopen
the daily window only when the earlier update failed, its integrity evidence is
invalid, or the operator explicitly requests another bounded update.

If the daily check was missed and a critical bounded attempt is already in
progress, finish or safely terminalize that attempt before updating. Never
change the executable beneath a sealed request or active process.

## 4. Routine runtime bootstrap and closeout

Routine Node runtime bootstrap is inert. Its exact adapter inventory is empty;
it does not write an environment value or file, scan the registry for dynamic
adapters, mutate Hall or global state, select a provider, invoke a host callback,
or start a process, source, checker, or Git action. Historical `weave:start`,
Loki resume, estate ritual, and legacy dynamic command names are unsupported
compatibility names. They fail closed and cannot continue a goal or create a
lifecycle record. Durable lifecycle changes require the matching
`cstar-kernel` tool and current operator authority.

The first-task-of-day freshness procedure is a CoS host workflow, not a Node
bootstrap side effect. Repository update, branch mutation, push, merge,
installation, restart, activation, and cleanup each remain separately
operator-gated.

For each plan step, retain only bounded evidence: exact target manifest,
source/runtime hashes, requested-versus-actual identity, test commands and
results, failure class, spend/source classification, independent validation,
and lifecycle receipt ids. High-volume logs stay in artifacts; beads receive
summaries and hashes.

On meaningful project work, send the mapped PMT one compact `STATE_UPDATE` for
freshness. PMT availability is not an execution gate. Close the host goal only
after CStar and the evidence agree; installation, restart, activation, merge,
deployment, and production remain distinct operator gates.
