# CStar Capability Discovery API

## Purpose

`cstar manifest` and `cstar skill-info` provide read-only views of the current
`.agents/skill_registry.json`. Discovery reports what the host may inspect. It
does not grant execution, lifecycle, spend, mutation, or activation authority.

The current registry contains exactly four agent-native skills:
`corvus-forge`, `researcher`, `cstar-closeout`, and
`council-autoresearch`. Deterministic kernel tools are declared by the typed
`cstar-kernel` MCP catalog instead of being duplicated as registry entries.

## Commands

```bash
cstar manifest --json
cstar skill-info <id> --json
```

`manifest` returns the normalized registry entries. `skill-info` returns one
entry and its preferred local instruction/contract document.

## Current Record Shape

Each capability record may include:

- `id`, `tier`, `description`, `viability`, and `risk`;
- `entry_surface`, `execution_mode`, `ownership_model`, and `owner_runtime`;
- `authority_path`, `instruction_path`, `entrypoint_path`, contracts, and tests;
- host-support declarations; and
- normalized invocation metadata.

For all four current entries:

- `tier` is `SKILL`;
- `execution_mode` is `agent-native`;
- `owner_runtime` is `host-agent`.

The three leaf skills use `entry_surface: host-only` and expose no shell
invocation. `council-autoresearch` uses `entry_surface: cli`, an explicit
terminal-required contract, `exec-bridge` host support, and the exact
repository-owned `node scripts/run-tsx.mjs` entrypoint with no kernel fallback.

`active_in_runtime: true` means the runtime recognizes the declaration and can
enforce its boundary. It does not mean the dispatcher may execute the skill.
`invoke.source: unavailable` is expected for the three host-only skills;
`invoke.source: inferred` is expected for the explicit Council bridge.

## Resolution

- Capability ids resolve against the registry object keys.
- Skill documentation resolves to the declared `instruction_path` first.
- Registry and document paths are project-relative and must remain contained by
  the CStar root.
- Unknown, retired, compatibility-only, weave, or spell ids must not be inferred
  into active capabilities.

Commander-derived command metadata may describe a real deterministic CLI
command when one exists. It cannot convert a host-only skill into a shell
command or create authority that the registry and repository policy do not
grant.

## Operator Guidance

- Use `manifest --json` to confirm the exact registered skill set.
- Use `skill-info` before activating one of those skills in the host harness or,
  for Council autoresearch, through its exact declared terminal bridge.
- Use the typed `cstar-kernel` MCP catalog for kernel tool inventory.
- Treat public AutoBot, One Mind, Ravens, model-memory workflows, legacy weaves,
  and recursive spells as retired even when historical source accepts their
  names.
- Keep source generation, local staging, installed/cache reconciliation,
  restart, live proof, and production readiness as separate gates.
