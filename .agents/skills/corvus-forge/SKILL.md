---
name: corvus-forge
description: Route bounded Corvus implementation through the native CStar Forge parent and independent validation lifecycle.
---

# Corvus Forge native swarm

Use the canonical lifecycle:

`cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute -> native parent -> DELIVERED_UNVERIFIED -> independent cstar_record_result -> CStar closeout`

The active implementation connection is `forge-native-codex-swarm-v1`. CStar
owns the durable SET, immutable request, policy intersection, one-run lease,
generation state, and lifecycle transitions. The native Forge parent owns the
work-item partition, integration, evidence aggregation, and bounded child
dispatch. A parent may launch zero to three useful leaves. Leaves have exact
disjoint write paths and cannot create descendants.

The effective scope is the intersection of:

`durable_SET_scope ∩ immutable_request_scope ∩ active_connection_policy ∩ run_lease_scope`

Reject empty or broader intersections, missing native capabilities, path
overlap, path escape, duplicate idempotency keys, and any fallback. The native
capability set is `spawn_agent`, `list_agents`, `send_message`, `followup_task`,
`wait_agent`, and `interrupt_agent`; a missing operation fails before lease
reservation. Do not substitute Hermes, MiniMax, AutoBot, `codex exec`, a CLI,
transcript replay, shared-file coordination, or another bridge.

Worker packages contain goal, acceptance, source identity, bounded paths,
topology ceiling, requested selector, evidence root, and deadline. They never
contain SET authority, root authority, cancellation secrets, control receipts,
validation tickets, or lifecycle mutation capability. Control receipts remain
with the CStar Orchestrator. Delivery is always `DELIVERED_UNVERIFIED`.

Record requested selector (`gpt-5.6-luna`/`max`) separately from host-attested
actual identity. Use `unreported` when the host supplies no attestation. Never
infer actual identity from a task name, role, provider, or model self-report.

Preserve the original dirty root. Use a new isolated worktree, retain every
success/failure/cancel/UNKNOWN artifact, and publish only bounded evidence,
hashes, receipts, and gaps. UNKNOWN is frozen with zero retry. Cancellation
requires interruption proof for every observed task; an uninspectable task
remains UNKNOWN.

After native completion, launch one standalone validator outside the Forge
ancestry. Only that validator's exact ticket and candidate digest may support
`cstar_record_result`. Validation, installation, activation, restart,
deployment, production, secrets/configuration, Git publication, live
migration, and permanent deletion remain separately gated.
