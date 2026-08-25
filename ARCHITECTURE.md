# CStar Architecture

> **Legacy architecture:** CStar is preserved as an inactive historical
> subsystem. Corvus Organism is the current estate control and workflow plane.
> References below to ownership or authoritative runtime describe the retired
> CStar design and grant no current execution or lifecycle authority.

## 1. Position in the Estate

CStar historically served as the deterministic control plane and durable
lifecycle ledger for the Corvus estate. It is no longer active.

Registries and schemas declare capability. Runtime observations, artifacts,
callbacks, and dashboards provide evidence. Capability and evidence cannot
grant or weaken authority.

## 2. Kernel and Host Boundary

The Node/TypeScript kernel owns bounded deterministic behavior:

- MCP schemas and input validation;
- Hall/PennyOne lifecycle persistence;
- request/attempt/validation receipts;
- path, package, and output locks;
- atomic reservation and transaction boundaries;
- bounded status, telemetry, and routing projections; and
- process/transport containment.

Host agents own cognition, synthesis, critique, and operator conversation.
Host-native skills are harness capabilities, not assumed shell commands. A
model response never directly becomes lifecycle or validation authority.

## 3. Supported MCP Runtime

`cstar-kernel` is the authoritative bounded MCP surface. Public metadata lives
in `src/tools/cstar-kernel-mcp/contracts/tool_catalog.ts`; schemas/handlers are
registered in `src/tools/cstar-kernel-mcp/register_core_tools.ts`.

Codex uses a single direct-stdio lineage from the global WSL wrapper to
`bin/cstar-kernel-mcp.js` and the source TypeScript server. The Codex plugin is
skill-only. The former TCP daemon and public AutoBot surface are retired and
fail closed.

This direct-stdio lineage assumes a trusted single-user host. Session-record
hashing proves provenance inside that account; it is not an isolation boundary
against another same-UID process that can read the Codex session store.

The CLI remains for documented terminal-required operations and development,
not as a parallel authority or generic skill/model dispatch path.

## 4. Lifecycle and Memory

Beads are the durable work timeline. Proposals, Forge/Researcher requests,
execution attempts, validation runs, and completion transitions live in
Hall/PennyOne. High-volume search/model output remains in bounded artifacts;
Hall stores summaries, hashes, decisions, and identifiers.

PMTs are project-scoped information repositories. CoS queries the mapped PMT
for bounded context only when active targets are inside that project, and sends
a compact update after meaningful work. PMT state is a context copy, not
lifecycle or review authority. MM is legacy.

PennyOne dashboards, Mongo, and the console are projections/mailboxes. They do
not replace Hall lifecycle state.

## 5. Estate Lanes

- CoS owns estate sequencing, bounded Green/Yellow execution, evidence
  packaging, lifecycle updates, and operator-facing closeout.
- Forge implements bounded builds.
- Researcher gathers evidence through authorized source lanes.
- CorvusEye independently evaluates or red-teams when required.
- Codex subagents may analyze or review but cannot replace Forge.

Cross-project conflicts return directly to CoS. There is no active MM relay.

## 6. Forge Execution

The live build route is:

`cstar_forge_request -> cstar_forge_execute -> private Hermes cstar-hub /
minimax MiniMax-M3 -> delivered_unverified -> independent cstar_record_result`

The request is no-spend and immutable. Execute verifies a request-bound
one-shot operator attestation, exact canonical request/target hashes,
package/output locks, adapter runtime seal, expiry, and attempt budget before
atomic reservation. The write worker accepts only a strict manifest and rolls
back all writes on post-write failure.

Delivery is evidence, not success. Independent hash-verified validation and
Forge finalization are one transaction. Unknown or failed attempts do not
auto-retry.

## 7. Routing Advice

Augury is deterministic typed route explanation. Use it only at a new or
ambiguous route/material scope and never as a per-prompt ritual. It is
non-actionable and grants no execution permission.

The Council supplies one immutable canonical critique lens. It cannot vote,
hold, assign risk/ownership, emit confidence, or prove correctness.

TokenPath is quarantined (`shadow-disabled`, non-actionable) and performs no
advice, steering, episode, or observation writes. Historical ledgers are
untrusted compatibility telemetry.

Persona affects professional tone and domain emphasis only.

## 8. Skills and Capabilities

The registry classifies capabilities; it does not authorize invocation.
Reusable behavior is built skill-first with explicit inputs, outputs, logs,
failure classes, receipts, and focused tests before MCP promotion.

Tier labels describe composition, not authority:

- `PRIME`: deterministic atomic primitive;
- `SKILL`: bounded functional capability;
- `WEAVE`: composed workflow; and
- `SPELL`: governance/recursive policy, non-executable unless explicitly
  runtime-backed.

## 9. Verification

Changed behavior is tested in the repository that changed. Control-plane
boundary changes also run CStar contract and stdio tests. Current source, live
runtime, lifecycle state, and independent evidence must agree before closeout.

Never infer quality from legacy Gungnir fields. Numeric claims require an actual
scorer, nonzero denominator, formula, exclusions, class coverage, row evidence,
and an independent probe. Development evidence is separate from production and
locked-holdout readiness.

## 10. Operator Gates

Explicit operator authorization remains required for expanded spend or source
lanes, locked holdout, production claims, merge, push, deploy, restart,
secrets/configuration, destructive cleanup, and broad cross-spoke mutation.
Source proof, host staging, cache/config reconciliation, restart, and live
activation proof are distinct steps.
