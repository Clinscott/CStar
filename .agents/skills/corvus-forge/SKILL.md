---
name: corvus-forge
description: Route Corvus implementation, repair, refactoring, and build work through the durable CStar native flat-dispatch and independent-validation lifecycle.
---

# Corvus Forge

Use the current native route only:

`cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute -> cstar_forge_swarm_plan -> direct host-native workers -> cstar_forge_swarm_update -> separate read-only aggregator -> cstar_forge_swarm_complete -> DELIVERED_UNVERIFIED -> independent cstar_record_result -> CoS closeout`

The active connection is `forge-native-codex-swarm-v1`. The execute boundary
returns a worker package and a distinct CStar control receipt. CoS converts
those immutable inputs into one closed host packet, records one exact plan,
launches one to three useful direct workers with disjoint ownership, and
records each terminal leaf receipt. Workers have no nested Forge parent,
descendants, peer authority transfer, retry, replay, replacement, or selector
fallback unless a later operator-authorized contract says otherwise.

The requested selector and reasoning are immutable packet inputs. Do not encode
a model as a validator default or target. Record requested and actual identity
separately. Before a host supplies distinct attestation, actual identity is
`unreported`; a worker self-report is not attestation.

Validate the exact host packet before dispatch:

```text
node .agents/skills/corvus-forge/scripts/validate_native_swarm_packet.mjs \
  <packet.json>
```

After every direct worker is terminal, a separate read-only aggregator consumes
only the packet, terminal receipts, frozen candidate identities, and bounded
evidence. It performs no implementation, repair, retest, cancellation,
authority change, or source write. Validate its terminal receipt with:

```text
node .agents/skills/corvus-forge/scripts/validate_native_swarm_receipt.mjs \
  <packet.json> <receipt.json>
```

The validators use closed canonical JSON, normalize declared unordered sets,
bind explicit ordinals, recompute hashes and local file identities, enforce
direct ancestry and disjoint ownership, and require the aggregator to be a
separate read-only task. Valid output remains `DELIVERED_UNVERIFIED`.

Use `cstar_forge_swarm_status` for read-only observation. Cancellation is a
two-stage control-receipt operation: request cancellation, inspect every task,
then record `CANCELLED` only with complete terminal stop proof; otherwise
freeze `UNKNOWN`. Never launch a replacement from cancellation.

Read `docs/operations/corvus-forge-pipeline-playbook.md` and
`docs/operations/corvus-forge-skill-spec.md` for packet and validation details.

- A request and authorization are no-spend. Execute reserves or replays one
  exact native run; capability declaration alone launches no model or worker.
- Carry exact source identity, targets, required outputs, checks, evidence,
  retry/spend policy, dirty-root isolation, callback, and operator authority.
- Treat `DELIVERED_UNVERIFIED` as delivery evidence only. Independent
  `cstar_record_result` is the sole next lifecycle acceptance surface.
- Preserve separate gates for installation, restart, commit, push, merge,
  deployment, secrets/configuration, locked holdout, and production claims.
- On missing lifecycle primitives, lease expiry, head/manifest drift, dirty
  overlap, incomplete task inspection, or validation failure, fail closed and
  record the exact repair item.

Historical Codex-host state-only handoff and private Hermes/MiniMax material is
tombstone or explicitly selected legacy evidence only. It is never the current,
default, target, replacement, recovery, or fallback Forge path.
