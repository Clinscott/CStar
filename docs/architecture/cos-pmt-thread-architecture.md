# CoS and Project-Context Thread Architecture

This document defines the Corvus Codex-thread operating architecture. Thread
topology is part of the system architecture. Refactoring thread responsibility
follows the same separation-of-concerns rules as refactoring source code.

## Control Principle

CStar is the canonical control plane for Corvus estate work. Planning state,
proposal lifecycle, execution state, validation, and completion should be
represented through CStar proposals, beads, receipts, or bounded artifacts
whenever a kernel-backed path exists.

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

- translating User intent into CStar-tracked goals, proposals, gates, and
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

CStar is the axle rather than a PMT or worker spoke. Its kernel owns the
canonical lifecycle surfaces for beads, proposals, Augury, Hall, routing,
receipts, validation, and completion. The cstar-console and PennyOne mirror
operator-visible state but do not supersede kernel lifecycle records.

### Researcher

Researcher gathers evidence through authorized source lanes. It owns source
discovery, source receipts, evidence packages, and research-run telemetry. It
does not own CStar implementation, Forge delivery, or production rollout.

### Corvus Forge

Corvus Forge builds implementation through the durable
`cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute -> Codex-host
state-only handoff -> independent cstar_record_result` path. Current v3 records
`runner_owner: "codex-host"`, requested `gpt-5.6-luna`/`max`, and separate
host-attested actual identity; absent attestation is `unreported`/`null`. CStar
does not launch provider, cognition, or CStar work at handoff. Private Hermes
`cstar-hub`/MiniMax-M3 is retained only as explicit legacy v2 compatibility.
Its delivery remains pending independent validation recorded through CStar. Forge
does not approve its own rollout.

### CorvusEye

CorvusEye is the independent evaluation and red-team spoke. It reviews
Researcher or Forge evidence when producer-independent validation is required;
it does not perform the originating work it judges.

### MM

MM is inactive and has no active routing, synthesis, ownership, relay, review,
or execution role. Current work routes from CoS through CStar to the appropriate
spoke.

## Goal Lifecycle

1. CoS receives User intent and records the goal as a bounded CStar-tracked
   decision, proposal, or bead.
2. If the target belongs to a project with a mapped PMT, CoS reads one bounded
   context packet; failure is recorded only as a freshness gap.
3. CoS resolves route and scope through CStar and sends build work to Forge,
   research work to Researcher, and independent review to CorvusEye.
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
- let a producer perform an independent review required for its own gate.

Temporary bootstrap repairs must be recorded as bounded exceptions and followed
by restoration work that returns implementation, research, and review to their
proper spokes.
