# CoS and Project Information-Repository Architecture

## Control Principle

The operator sets direction and grants gates. CoS owns estate sequencing,
converts direction into bounded CStar lifecycle state, routes work through the
correct execution or research lane, packages evidence, and closes accepted
Green/Yellow work. CStar is the estate axle and canonical state plane; it is not
authority above the operator or platform.

PMT is retained as a project information-repository concept only. MM is legacy
and has no active role.

## CoS

CoS is the operator-facing coordinator and owns:

- estate and cross-project sequencing;
- bounded Green/Yellow execution and closeout;
- bead/decision anchoring, evidence packaging, and lifecycle updates;
- routing builds to Forge and research to Researcher;
- deciding when independent CorvusEye or other validation is required;
- returning red gates, spend/scope expansion, and authority conflicts to the
  operator; and
- compact state-update packets to project information repositories after
  meaningful work.

CoS does not bypass CStar with direct Hall/SQLite writes, replace Forge with a
Codex subagent, replace Researcher with ad hoc browsing, or infer authority from
a registry, callback, runtime observation, PMT record, or model claim.

## PMT Information Repositories

PMTs are passive project information repositories. When active targets are
inside a project with a mapped PMT, CoS queries that PMT once for the bounded
context relevant to the mission. Unrelated PMTs are not queried. The repository
retains decisions, constraints, material evidence, and unresolved gates so a
later CoS context does not need the full estate history.

PMTs do not:

- own execution, review, approval, routing, monitoring, or operator contact;
- assign workers or invoke Forge/Researcher;
- accept or reject a delivery;
- create or weaken an authority gate;
- act as a required relay; or
- replace CStar lifecycle state.

After meaningful work, CoS sends a bounded `STATE_UPDATE` packet containing:

- bead/decision and current status;
- changed or reviewed paths;
- validation identifiers and material evidence hashes;
- decisions made, residual risks, and remaining gates; and
- the next safe action.

The repository stores the packet. It does not answer with an authoritative
verdict. If repository state conflicts with CStar or current operator policy,
CoS fails closed, repairs the record, and treats the PMT copy as stale.
If the repository is unavailable, CoS records a freshness gap and continues
from current CStar and repository evidence when otherwise authorized.

Run the query in the PMT thread with an enforceable current GPT-5.6 selector:
Luna for routine bounded retrieval, Terra for conflicting-context synthesis,
and Sol for high-stakes architecture, security, or incident forensics. Record
requested versus actual model identity. If selection is unavailable, do not
claim control over it.

## MM Legacy Status

MM is retired from active estate routing. Do not send work, decisions,
cross-project synthesis, or status packets through MM. CoS directly handles
estate sequencing and resolves cross-project conflicts under the applicable
operator gates. Historical MM threads and records are archival leads only.

## Corvus Forge

Corvus Forge is the implementation lane. Live builds use only:

`cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute -> private Hermes cstar-hub /
minimax MiniMax-M3 -> delivered_unverified -> independent cstar_record_result`

The Forge request may name a `state_update_thread_id` for the passive project
repository and names a CoS callback destination. Its absence cannot block an
otherwise authorized execution. The deprecated
`owner_pmt_thread_id` alias may be accepted for transport compatibility but
grants no ownership or review authority.

## Researcher

Researcher gathers evidence through authorized source lanes and writes bounded
receipts or artifacts. Live external collection is separately gated. Researcher
does not implement spoke code, mutate CStar lifecycle state outside its request
contract, or self-certify a consequential truth/production claim.

## CorvusEye

CorvusEye is an independent evaluation and red-team lane. Use it when the gate
requires producer/reviewer separation, adversarial testing, or a truth/lie
assessment. Its evidence informs CoS and CStar; CorvusEye does not replace the
operator's authority.

## PennyOne and Console

PennyOne/Hall and the console mirror bounded operator-visible state. Hall bead,
proposal, request, attempt, and validation records are canonical lifecycle
evidence. Mongo, dashboards, PMTs, and legacy MM are mirrors or archives, not
lifecycle authority.

## Goal Lifecycle

1. CoS records or resumes the bounded CStar bead/decision.
2. CoS selects Forge, Researcher, independent review, or an operator gate.
3. Green/Yellow work proceeds through the proper lane inside the accepted
   envelope; red or expanded work returns to the operator.
4. Delivery artifacts remain evidence until independent validation is recorded.
5. CoS records the result, updates or resolves the bead, writes the bounded PMT
   information packet, and closes the operator-facing loop.
6. When waiting on an external lane, CoS pauses rather than continuously polls.

## Operator Gates

Explicit operator authorization remains required for:

- spend beyond the recorded request or any retry not already authorized;
- live source collection or a new source lane;
- locked holdout or production-readiness claims;
- merge, push, deploy, restart, secrets, credentials, or host configuration;
- destructive cleanup or broad cross-spoke mutation;
- authority-model or persistent-role changes; and
- scope expansion beyond the accepted bead/decision.

## Separation Tests

An architecture change fails review when it:

- gives a PMT or legacy MM any authority;
- lets a producer supply the only consequential validation of its own output;
- lets a Codex subagent or direct model call replace Forge;
- lets Researcher both collect and self-certify a high-stakes claim;
- lets persona, Council, Augury, TokenPath, registry, or runtime metadata grant
  execution authority; or
- records a lifecycle transition only in a callback, artifact, dashboard,
  Mongo queue, PMT packet, MM archive, or ad hoc state file instead of CStar.
