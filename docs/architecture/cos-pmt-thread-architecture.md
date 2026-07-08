# CoS and PMT Thread Architecture

This document defines the Corvus Codex-thread operating architecture. Thread topology is part of the system architecture. Refactoring thread ownership follows the same separation-of-concerns rules as refactoring source code.

## Control Principle

CStar remains the canonical control plane for Corvus estate work. Planning state, proposal lifecycle, task ownership, validation, and completion should be represented through CStar proposals, beads, receipts, or bounded artifacts whenever a kernel-backed path exists.

The User authorizes high-order direction and red-gated instructions. CoS converts that direction into bounded routing, decision packets, gates, and review outcomes. PMTs own their bounded domains. Workers and tools perform narrow execution under the PMT that owns the domain.

## Required Thread Boundaries

### CoS Thread

CoS is the estate overseer and operator-facing decision surface.

CoS owns:

- translating User intent into CStar-tracked goals, proposals, gates, and routing decisions;
- accepting, rejecting, parking, or escalating PMT packets;
- detecting cross-domain conflicts, authority disputes, stale ownership, and red-gate conditions;
- maintaining goal continuity while external PMTs are running, blocked, or waiting for review;
- asking the User only for high-order choices, red-gated authorization, or unresolved policy conflicts.

CoS does not own routine implementation, repeated shoulder-surfacing of PMTs, worker execution, or direct bypass of CStar state when a kernel-backed route exists.

### CStar Control Plane PMT

The CStar Control Plane PMT owns CStar and cstar-console control-plane surfaces.

It owns:

- CStar kernel, bead, proposal, Augury, Hall, routing, and receipt mechanics;
- cstar-console UI and operator control-room behavior;
- control-plane schema, status, review queues, and acceptance workflows;
- integration contracts that let PMTs report into CStar.

It must not also own Researcher execution or Corvus Forge implementation work. If a CStar Console thread is carrying Researcher or Forge delivery responsibility, that is architectural drift and must be split.

### Researcher PMT

The Researcher PMT owns research and evidence production.

It owns:

- source discovery, source weighting, source receipts, and evidence packages;
- Researcher v2 behavior, Hermes Researcher profile diagnostics, and truth/lie evaluation surfaces;
- source-adapter readiness, source-collection gates, and model/tool telemetry for research runs;
- research package integrity, hidden-boundary safety, and development-vs-holdout separation.

It does not own CStar control-plane implementation, Forge builds, PR packaging for unrelated repositories, or production rollout authority.

### Corvus Forge PMT

The Corvus Forge PMT owns build and implementation delivery.

It owns:

- repository implementation plans, worker assignment, local repair, tests, package validation, and PR packaging;
- build-lane validation for Corvus projects and spokes;
- implementation receipts, dirty-root accounting, and merge-readiness packets.

It does not own research truth gates, Researcher source collection, CStar kernel authority, or independent acceptance of its own production rollout.

### CorvusEye Review PMT

The CorvusEye Review PMT is an independent review and audit lane.

It owns:

- schema review, hidden-boundary review, acceptance-package review, and safety regressions;
- independent review of Researcher and Forge outputs when the gate requires separation from the producer PMT.

It does not perform the originating implementation or research run that it reviews.

### MM Estate Synthesis

MM is an estate synthesis and coordination lane, not a relay requirement for every packet.

It owns:

- cross-PMT synthesis, dependency compression, conflict detection, and estate-wide status summaries;
- escalation support when a goal spans multiple PMTs or when CoS asks for synthesis.

It should not become a routine message relay for simple single-domain gates. Direct CoS-to-pinned-PMT routing is valid when one domain owns the work and no cross-PMT dependency exists.

## Goal Lifecycle

1. CoS receives User intent and records the goal as a bounded CStar-tracked decision, proposal, or bead.
2. CoS selects the owning PMT by bounded context.
3. The PMT accepts or rejects domain ownership before execution.
4. The PMT may perform bounded Green or Yellow repair inside its domain without returning every simple blocker to CoS.
5. Red gates return to CoS for explicit User authorization when required.
6. While a PMT is running, CoS keeps the goal parked or blocked rather than polling continuously.
7. When a PMT returns a packet, CoS reviews the packet, records the decision, and either closes, routes the next gate, or escalates.

## Red Gates

Red gates require explicit CoS/User authorization before execution:

- secrets, credentials, token inspection, token output, or credential mutation;
- production deploys, restarts, broad rollout, or external irreversible effects;
- destructive cleanup, history rewrite, deletion, reset, or stash operations outside a narrow explicit request;
- main/master push, merge, release, or acceptance of production readiness;
- locked-holdout evaluation, hidden-label access, or tuning against sealed evaluation data;
- authority-model changes, ownership-boundary changes, or PMT responsibility merges;
- direct Hall or SQLite bypass when a CStar kernel-backed path exists;
- source/model budget expansion outside the accepted envelope.

## Separation Tests

Any future architecture change fails review if it makes one thread routinely responsible for more than one bounded PMT domain. In particular:

- CStar Control Plane PMT plus Researcher PMT is a violation;
- CStar Control Plane PMT plus Corvus Forge PMT is a violation;
- Researcher PMT plus Corvus Forge PMT is a violation;
- producer PMT plus independent review PMT is a violation for gates requiring independent review.

Temporary emergency exception paths must be recorded as exceptions, bounded by one goal, and followed by a restoration task that returns ownership to the split architecture.
