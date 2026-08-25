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
   The v2 call accepts only the request receipt id, request SHA-256, and a
   structured `host_goal_projection`; the kernel derives the bead, decision,
   target scope, and immutable root-repair sidecar from the persisted request.
   Callers cannot supply or replace those lineage fields. The projection uses
   `cstar.host_get_goal_projection.v1` and contains the exact host objective,
   status, counters, timestamps, root thread, and
   `hostResumeCapability: "unavailable"`.

   This appends a `cstar.host_goal_resume.v2` decision event containing only
   bounded hashes, canonical snapshot material, and lifecycle/operator lineage.
   It is a `continuity_only` overlay: the host status remains `blocked`, no
   host object is mutated, and it grants no spend, source, Git, installation,
   restart, deployment, or production authority. A later ordinary turn on the
   same canonical root thread does not need fresh repair wording or an old
   exact challenge. Questions, status text, and unrelated neutral text are
   liveness evidence only; they do not expand authority. Revocation,
   negation, protected actions, scope expansion, a different target or goal,
   forks, and switches veto continuity and fail closed.

   After an exact zero-provider, zero-spend, no-source, and no-write mechanical
   failure, the continuity context may say, `The error should be fixed and the build proceed`. In v2 this wording grants continuity only and never creates Forge authority. Do not ask the operator to repeat the build request when the bounded continuation contract applies: preserve the original Forge authorization, validate the repair, and resume through the trusted receipt. The original Forge authorization remains authoritative, while protected,
   scope, spend, source, Git, installation, restart, activation, deployment,
   secrets/config, and production gates remain independently enforced.

5. Maintain a short plan with at most one in-progress step. Put the relevant
   bead or decision ids in the plan/explanation when the host supports it.

### Canonical host-goal snapshot

`cstar_goal_resume` accepts the structured host projection

```json
{"forge_request_receipt_id":"dispatch-forge-<32 hex>","request_sha256":"<64 lowercase hex>","host_goal_projection":{"schema":"cstar.host_get_goal_projection.v1","threadId":"<host-root-thread>","objective":"<exact objective>","status":"blocked","tokensUsed":<safe integer>,"timeUsedSeconds":<safe integer>,"createdAt":<safe integer>,"updatedAt":<safe integer>,"hostResumeCapability":"unavailable"}}
```

The caller supplies the request receipt id and request SHA-256 as the only
request lineage fields. The kernel reads the supported v3 request and derives
the bead, decision, target/scope digests, package-lock digest, and immutable
root-repair sidecar. It rejects hash-only host material, caller-supplied bead
or decision fields, malformed counters, and timestamp drift.

The objective is hashed as the SHA-256 digest of its exact UTF-8 bytes. The
input is not trimmed and is not Unicode-normalized. `createdAt` and `updatedAt`
are safe non-negative integers, and `createdAt` cannot be later than
`updatedAt`. `tokensUsed` and `timeUsedSeconds` are validated projection input
only; they are not canonical receipt material.

The persisted canonical snapshot material uses
`cstar.host_goal_snapshot.v1`. Its fixed, no-whitespace JSON key order is
`schema`, `host_goal_thread_id`, `host_goal_objective_sha256`,
`host_goal_status`, `host_goal_created_at`, `host_goal_updated_at`, and
`host_resume_capability`. `host_goal_snapshot_sha256` is the SHA-256 digest of
that exact serialization. The receipt stores only this material, its hashes,
and bounded lifecycle/operator lineage. It never persists the raw objective,
raw operator/current-turn text, `tokensUsed`, or `timeUsedSeconds`.

The returned `resume_id` is an immutable `goal-resume-v2:<sha256>` continuity
receipt. Exact replay returns the existing id and does not insert a second
event, attempt, or authorization. It may be passed to
`cstar_forge_authorize` without repeating repair wording using only this safe
payload:

```json
{"forge_request_receipt_id":"dispatch-forge-<32 hex>","request_sha256":"<64 lowercase hex>","goal_resume_id":"goal-resume-v2:<64 lowercase hex>"}
```

Forge derives bead, decision, root-repair, and operator lineage from the
trusted request and v2 event. A v1 `goal_resume_id` is historical-only and is
rejected with `forge_goal_resume_v1_historical_only`. The v2 receipt does not
inherit or grant any protected effect: the original request, scope, retry,
spend, source, Git, installation, restart, activation, deployment,
secrets/config, and production gates remain independently required.

Mark a goal complete only after the requested outcome, focused validation,
independent review where required, CStar result recording, and closeout are all
done. Mark it blocked only when the host's blocked threshold is actually met;
a red gate or failed attempt is a problem to diagnose, plan, and persist, not a
reason to abandon the mission.

## 2. Route each bounded subtask

Use the narrowest capable lane:

- **Corvus Forge native flat dispatch** follows `cstar_forge_request ->
  cstar_forge_authorize -> cstar_forge_execute -> cstar_forge_swarm_plan ->
  direct host-native workers -> cstar_forge_swarm_update -> separate read-only
  aggregator -> cstar_forge_swarm_complete -> DELIVERED_UNVERIFIED ->
  independent cstar_record_result` on active connection
  `forge-native-codex-swarm-v1`. One to three useful direct workers have
  disjoint ownership, no descendants, one attempt, and zero retry, replay,
  replacement, or fallback. Requested selector and reasoning are immutable;
  actual identity is `unreported` absent distinct host attestation.
- **Historical Forge compatibility evidence** includes the retained Codex-host
  state-only handoff and consumer, AutoBot, Hermes, and MiniMax. Each is legacy,
  retired, or generation-tombstoned and is never a current, default, target,
  recovery, replacement, or fallback route.
- **Researcher / CStar-native no-spend evidence request** for authorized
  research and evidence gathering; any live source transport remains separately
  authorized.
- **Codex subagent** for bounded analysis, inspection, tests, or independent
  review. A subagent is not Forge implementation.
- **CoS bootstrap repair** only when the canonical CStar/Forge boundary itself
  is broken and the Forge runbook permits the exception.

When a Forge cycle has exact zero-provider, zero-spend, no-source, and no-write
evidence, do not ask the operator to repeat the build request. Preserve the
original immutable request and authorization, repair the bounded mechanical
defect, obtain independent validation for the repaired artifacts, and resume
through its pending continuation receipt. Provider start or ambiguity, scope or
lock drift, expiry, revocation, and the bounded no-progress limits remain hard
stops. Goal continuity can keep this workflow moving, but only the original
Forge authorization supplies execution authority.

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

1. Run `codex --version`. When an authorized audit of historical legacy-adapter
   evidence or an authorized source transport uses Hermes, also run `hermes --version` and
   `hermes update --check`.
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
