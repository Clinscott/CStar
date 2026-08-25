---
name: corvus-forge
description: "Historical-only Forge tombstone. It must fail closed and redirect no work."
metadata:
  status: TOMBSTONED_PERMANENT
  entry_surface: compatibility
  owner_runtime: historical-record
---

# Corvus Forge Tombstone

Forge is permanently defunct. This skill exists only so stale prompts,
registries, links, and historical receipts fail closed with one stable result.
Historical Forge material is evidence only.

## Mandatory result

Any attempted Forge invocation must return:

`FORGE_TOMBSTONED_PERMANENT`

It must perform zero implementation, dispatch, provider, network, lifecycle,
Hall, Git, install, activation, restart, deployment, secret/configuration, or
destructive effects.

## Prohibited behavior

- Do not call `cstar_forge_request`, `cstar_forge_authorize`,
  `cstar_forge_execute`, or `cstar_forge_host_complete`.
- Do not use Forge as an implementation substrate, lifecycle synonym,
  compatibility lane, fallback, transport, router, or future effector.
- Do not revive Hermes, MiniMax, AutoBot, provider handoffs, role chains, or
  cached Forge runtime bytes.
- Do not translate a Forge request into a provider call or generic worker call.
- Do not delete or rewrite historical Forge evidence.

## Current implementation route

Implementation requires this sequence:

`operator intent -> Chief of Staff -> CStar Bead/SET -> deterministic effect
reservation -> native task-control work cell -> typed ACK -> typed terminal
packet -> independent validation -> cstar_record_result -> CSF-D007 checkpoint`

`cstar_mission` may derive and persist a bounded host-owned mission request. It
does not launch a worker or grant authority. The deterministic runner owns the
effect transition. Task-control transports the effect and evidence only.

If the deterministic runner, required effect transition, capability profile,
or task-control transport is unavailable, record the exact typed failure and
stop. Do not choose a weaker fallback.

## Historical evidence

The following files may retain detailed Forge history and tests. They are not
current procedures:

- `docs/operations/corvus-forge-pipeline-playbook.md`
- `docs/operations/corvus-forge-skill-spec.md`
- `.agents/skills/corvus-forge/runtime/`
- `.agents/skills/corvus-forge/scripts/`
- Forge receipts, migrations, quarantines, and validation fixtures

Current registries and generated host packages must mark this skill
`TOMBSTONED_PERMANENT` and unsupported for every host.
