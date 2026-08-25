# CoS and Project-Context Thread Architecture

This document defines the Corvus Codex-thread operating architecture. Thread
topology is part of the system architecture. Refactoring thread responsibility
follows the same separation-of-concerns rules as refactoring source code.

## Control Principle

CStar is only the deterministic state manager for Corvus estate work. It records
bounded planning state, proposal lifecycle, execution receipts, validation, and
completion through CStar proposals, beads, receipts, or bounded artifacts when
a kernel-backed path exists. It does not launch agents, workthreads, providers,
or model cognition.

CoS in Codex is the orchestrator and supervisor/delegator. CoS binds and
sequences CStar state, defines bounded assignments, dispatches owning workers,
reviews returned evidence, requests correction, records independent validation,
resolves beads, and closes out. CStar records those transitions; it does not
become the worker launcher.

Authority begins with platform safety and the current operator grant, followed
by global Corvus invariants, the nearest repository policy, and then CStar
lifecycle state. Registries and observed runtime are evidence; neither may
create or weaken authority.

The User authorizes high-order direction and red-gated instructions. CoS turns
that direction into bounded CStar work, selects the proper execution or review
spoke, packages evidence, and closes the lifecycle. PMT tasks are mapped
project-context repositories. When an in-scope project has a mapped PMT, CoS
must read one bounded context packet. PMTs do not own work or route workers.

## Required Thread Boundaries

### CoS Thread

CoS is the estate overseer and operator-facing decision surface.

CoS owns:

- translating User intent into CStar-tracked decisions, proposals, beads, gates, and
  routing decisions;
- sequencing bounded Green or Yellow work and returning red gates to the User;
- querying only a mapped project PMT for bounded context when its project is in
  scope;
- sending a compact `STATE_UPDATE` to that PMT after meaningful project work;
- reviewing worker and validator evidence and recording lifecycle outcomes;
- detecting cross-domain conflicts, authority disputes, stale context, and
  unsafe boundary expansion.

CoS does not bypass CStar state when a kernel-backed route exists. It does not
substitute a Codex subagent for Forge implementation, Researcher collection, or
independent CorvusEye review.
CoS must not implement, research, debug, edit source, run worker tests or
validation, or silently take over failed worker work. A CoS review is evidence
triage and a lifecycle decision; independent validation remains with CorvusEye
or another distinct validator.

### Direct Codex Subagents and Retained Workthreads

A substantive direct Codex subagent is a host-dispatched worker for a bounded
assignment. CoS may dispatch the owning worker and review its returned evidence,
but CoS does not perform the assignment. A direct Codex subagent cannot replace
Forge implementation, Researcher evidence collection, or CorvusEye/distinct
validator review.

A `workthread` is only a retained/resumable host-issued worker thread with
stable lineage. It is not a CStar kernel object, a provider launcher, or a
permission. CStar must not launch a workthread, agent, or provider, and this
contract claims no runtime support beyond a host surface that exposes it.

Every substantive direct Codex subagent and retained/resumable workthread must
request `gpt-5.6-luna` with reasoning effort `max` through a host surface that
exposes an enforceable selector. Its bounded packet records, separately,
`requested_model`, `requested_reasoning`, `selector_status`, and
`actual_identity`; when the host reports no actual identity, use
`actual_identity: unreported` and do not infer it from the task, provider, or
prompt. Selector absence or mismatch is a visible unsupported/blocked result;
do not substitute another model or reasoning setting and never silently fall
back.

Augury is a distinct advisory exception: the first opinion requests
`gpt-5.6-sol` with reasoning effort `max`, and a needed second opinion requests
distinct `gpt-5.6-terra` with reasoning effort `max`. Both still require an
enforceable host selector and separate requested/actual identity recording, and
neither opinion grants authority or validation status.

This contract intentionally defines no numeric concurrency cap. CoS dispatches
only operator-granted bounded assignments and pauses for live workers or
external state.

### Worker-Owned Host Goals

A CStar bead or decision and a host goal are different objects. CStar remains
the deterministic and canonical state manager for the bead, decision, receipts,
validation, and completion; a host goal is worker-local evidence only.

CoS owns no host goal. CoS must never create, resume, update, pause, block,
complete, or close a host goal. CoS may bind and sequence the exact CStar bead
and dispatch a worker, then review the worker's returned evidence.

Every substantive implementation, research, debug, or validation assignment is
sent to a Luna Max worker or retained workthread that owns exactly one bounded
host goal. The worker-goal objective must bind the exact CStar bead id, the
decision, the target paths, and the checker contract. The worker records its
requested model, selector result, actual identity, goal identity, and local
status separately.
Host-goal status is worker-local evidence, never CStar lifecycle authority.

Recoverable correction stays in the same retained workthread and the same host
goal. If a replacement worker is required, it receives a new host goal and an
explicit bounded CStar handoff containing the bead, decision, target paths,
checker, and prior evidence; it never inherits hidden host-goal state or a
silently transferred goal. A distinct validator owns a distinct validation goal
and never reuses the implementation goal.

Legacy CoS-held host goals remain paused and historical until a supported
transfer exists. They are never deleted, silently resumed, or falsely marked
complete. CStar/kernel primitives may record deterministic bead state and
receipts, but CStar has no generic host-goal surface and never launches a worker,
workthread, provider, or cognition.

### Mapped Project PMTs

PMTs are project-scoped information repositories only.

A mapped PMT may provide:

- bounded historical project context;
- pointers to project artifacts, decisions, and known hazards;
- a compact snapshot that CoS can compare with current CStar and repository
  evidence;
- a destination for a post-work `STATE_UPDATE`.

A PMT grants no ownership, execution, review, approval, routing, or monitoring
authority. CoS does not query unrelated PMTs. A missing or stale mapped PMT is
a freshness gap, not an execution gate, and cannot park or block the goal.

For a mapped-PMT query, CoS requests the task-appropriate current GPT-5.6
profile only when the host exposes an enforceable selector: Luna for routine
retrieval, Terra for conflicting-context synthesis, and Sol for high-stakes
architecture, security, or incident forensics. The request records requested
and actual identity separately; absent a reported identity, actual is
`unreported`.

### CStar Control Plane

CStar is the axle rather than a PMT or worker spoke, but it is only the
deterministic state manager. Its kernel records canonical lifecycle state for
beads, proposals, Augury decisions, Hall references, routing decisions,
receipts, validation, and completion. The cstar-console and PennyOne mirror
operator-visible state but do not supersede those records. CStar does not launch
agents, workthreads, providers, or cognition; CoS owns orchestration at the
host boundary.

### Researcher

Researcher gathers evidence through authorized source lanes. It owns source
discovery, source receipts, evidence packages, and research-run telemetry. It
does not own CStar implementation, Forge delivery, or production rollout.

### Corvus Forge

Corvus Forge builds implementation through the durable
`cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute -> private Hermes cstar-hub ->
minimax/MiniMax-M3` path. Its delivery remains unverified until independent
validation is recorded through CStar. Forge does not approve its own rollout.

### CorvusEye

CorvusEye is the independent evaluation and red-team spoke. It reviews
Researcher or Forge evidence when producer-independent validation is required;
it does not perform the originating work it judges.

### MM

MM is legacy and has no active estate-routing, synthesis, ownership, or relay
role. Current work routes from CoS through CStar to the appropriate spoke.

## Goal Lifecycle

1. CoS receives User intent and records the requested work as a bounded
   CStar-tracked decision, proposal, or bead; this does not create a host goal.
2. If the target belongs to a project with a mapped PMT, CoS reads one bounded
   context packet; failure is recorded only as a freshness gap.
3. CoS resolves route and scope, binds the resulting state in CStar, and sends
   build work to Forge, research work to Researcher, and independent review to
   CorvusEye. CoS does not perform those worker assignments itself.
4. Each worker request, execution receipt, artifact, and validation remains
   evidence until the corresponding lifecycle transition is persisted.
5. Red gates return to CoS for explicit User authorization when required.
6. When waiting on a live worker or external state, CoS pauses rather than
   polling. A PMT read is never the live worker and never blocks execution.
7. CoS reviews returned evidence, records the decision, sends a compact mapped
   PMT `STATE_UPDATE` after meaningful project work, and closes or routes the
   next gate.

## Red Gates

Red gates require explicit CoS/User authorization before execution:

- secrets, credentials, token inspection, token output, or credential mutation;
- production deploys, restarts, broad rollout, or external irreversible effects;
- destructive cleanup, history rewrite, deletion, reset, or stash operations
  outside a narrow explicit request;
- main/master push, merge, release, or acceptance of production readiness;
- locked-holdout evaluation, hidden-label access, or tuning against sealed
  evaluation data;
- authority-model or execution-boundary changes;
- direct Hall or SQLite bypass when a CStar kernel-backed path exists;
- source/model budget expansion outside the accepted envelope.

## Separation Tests

Future architecture changes fail review if they:

- grant a PMT ownership, execution, review, approval, routing, or monitoring
  authority;
- make mapped PMT availability an execution or completion gate;
- restore MM as an active coordination or relay lane;
- merge CStar control-plane behavior with Researcher or Forge execution;
- merge Researcher and Forge responsibilities; or
- let CoS implement, research, debug, edit source, run worker tests or
  validation, or silently take over failed worker work;
- let CStar launch an agent, workthread, provider, or model cognition;
- treat a retained workthread as a kernel/provider launcher or claim host
  runtime support that is not exposed;
- let CoS own or mutate a host goal, including by creating, resuming, updating,
  pausing, blocking, completing, or closing it;
- reuse an implementation goal for recoverable correction, silently transfer a
  goal to a replacement worker, or let a replacement inherit hidden goal state;
- treat host-goal status as CStar lifecycle authority or let a validator reuse
  the implementation goal;
- add a generic CStar/kernel goal or worker launcher;
- accept a missing or mismatched worker model selector by silently substituting
  another model or reasoning setting; or
- let a producer perform an independent review required for its own gate.

Temporary bootstrap repairs must be recorded as bounded exceptions and followed
by restoration work that returns implementation, research, and review to their
proper spokes.
