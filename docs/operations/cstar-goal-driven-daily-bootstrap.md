# CStar Goal-Driven and Daily Bootstrap

This runbook keeps a non-trivial CStar mission continuous across long turns,
thread interruption, retained/resumable host workthread activity, and daily
toolchain changes. CStar is only the deterministic state manager; CoS in Codex
is the orchestrator/supervisor that dispatches bounded work and records the
result. `AGENTS.md` points here instead of duplicating the procedure.

## 1. Establish worker-owned host-goal continuity

Before a non-trivial bead, multi-file change, Forge/Researcher request, or
resumed mission, CoS binds the exact CStar bead/decision and dispatches the
owning host-issued worker. CoS owns no host goal and must never create, resume,
update, pause, block, complete, or close one.

The worker packet must contain the exact CStar bead id, decision, target paths,
checker contract, operator gates, and requested/actual model identity fields.
The Luna Max worker or retained workthread then creates and owns exactly one
bounded host goal for that assignment. Host-goal status is worker-local
evidence, never CStar lifecycle truth.

1. For recoverable correction, keep the same retained workthread and the same
   host goal; do not create a root-goal replacement.
2. If a replacement worker is required, give it a new host goal and an explicit
   bounded CStar handoff with the bead, decision, target paths, checker, and
   prior evidence. Never silently transfer or inherit hidden host-goal state.
3. A distinct validator receives a distinct validation goal and never reuses
   the implementation goal.
4. Legacy CoS-held goals stay paused and historical until a supported transfer
   exists. Never delete, silently resume, or falsely complete them.
5. Maintain a short CoS plan with at most one in-progress step. Put the bead or
   decision id, worker goal identity/status, and checker in the evidence packet;
   only CStar transitions determine lifecycle state.

If a host lacks the worker-goal or retained-thread surface, record the exact
capability gap and stop that assignment. `cstar_goal_resume`, when exposed, is
only a bounded continuity receipt; it does not mutate a host goal, create a
generic CStar goal, or launch a worker. CStar records deterministic bead state,
receipts, validation, and completion through supported kernel paths.

## 2. Route each bounded subtask

Use the narrowest capable lane:

- **Corvus Forge / Hermes MiniMax-M3** for implementation when the Forge lane
  applies. Request is no-spend; execute consumes the authorized attempt.
- **Researcher / Hermes** for authorized research and evidence gathering.
- **Host-issued direct Codex subagent or workthread** for a bounded delegated
  analysis, inspection, or lane-owned check when the host exposes the surface.
  CoS dispatches the owning worker and reviews returned evidence; it does not
  perform worker tasks or replace Forge implementation, Researcher collection,
  or independent validation.
- **CStar control-plane gaps** are recorded by CoS when the canonical
  CStar/Forge boundary itself is broken; any substantive repair or debug still
  goes to a Luna Max worker or the canonical Forge lane, and CoS never edits or
  validates worker work.

When a Forge cycle has exact zero-provider, zero-spend, no-source, and no-write
evidence, do not ask the operator to repeat the build request. Preserve the
original immutable request and authorization, route the bounded mechanical
defect through its owning lane, obtain independent validation for the repaired
artifacts, and resume through its pending continuation receipt. Provider start
or ambiguity, scope or lock drift, expiry, revocation, and the bounded
no-progress limits remain hard stops. Goal continuity can keep this workflow
moving, but only the original Forge authorization supplies execution authority.

Partition assignments by independent files or review questions. Avoid
concurrent edits to the same file. Every substantive direct Codex subagent and
retained/resumable workthread must request `gpt-5.6-luna` with reasoning effort
`max` through a host surface that exposes an enforceable selector. Every worker
packet records `requested_model`, `requested_reasoning`, `selector_status`, and
`actual_identity` separately. If the host does not report actual identity,
record `actual_identity: unreported`; never infer it from the provider, task
name, or prompt. Selector absence or mismatch is visible and blocked/unsupported
for that assignment; it may not silently fall back to another model or effort.

The Augury exception is explicit: the first opinion requests `gpt-5.6-sol` at
reasoning `max`; a needed second opinion requests distinct `gpt-5.6-terra` at
reasoning `max`. Both require an enforceable selector and separate requested
versus actual identity recording. This runbook defines no numeric concurrency
cap; CoS dispatches only operator-granted bounded assignments and pauses for
live workers or external state.

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
operator-gated. CStar records the deterministic lifecycle state; it does not
launch a Codex worker, retained workthread, provider, or model cognition.

For each plan step, retain only bounded evidence: exact target manifest,
source/runtime hashes, requested-versus-actual identity, test commands and
results, failure class, spend/source classification, independent validation,
and lifecycle receipt ids. High-volume logs stay in artifacts; beads receive
summaries and hashes.

On meaningful project work, send the mapped PMT one compact `STATE_UPDATE` for
freshness. PMT availability is not an execution gate. The owning worker closes
its host goal only after its bounded assignment and checker are complete; CoS
records CStar lifecycle state from the returned evidence. Installation,
restart, activation, merge, deployment, and production remain distinct
operator gates.
