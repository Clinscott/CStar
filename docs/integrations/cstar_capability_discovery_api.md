# CStar Capability Discovery API

`cstar` now exposes two registry-first discovery surfaces for operators, hosts, and tools that need to discover what exists before they invoke it.

Capability authority and shell authority are now explicit:

- `.agents/skill_registry.json` remains the source of truth for capability identity, ownership, contracts, and runtime boundaries.
- the live Commander command tree is the source of truth for shell invocation shape such as subcommands, aliases, options, and JSON support.
- discovery payloads merge those two surfaces so agents can tell where to look, why it matters, and how to invoke the capability.

## Commands

`cstar manifest --json`
- Returns the full capability catalog from `.agents/skill_registry.json`, enriched with runtime activation state and invocation hints.

`cstar skill-info <id> --json`
- Returns the per-capability contract view for one registry entry.
- Resolution is registry-first: capability id match, then `runtime_trigger` match.

## Manifest Payload

Each `capabilities[]` record includes:

- `id`: canonical registry id.
- `tier`: `PRIME`, `SKILL`, `WEAVE`, or `SPELL`.
- `entry_surface`: `cli`, `host-only`, or `compatibility`.
- `shell_command`: recommended shell invocation when direct CLI use is supported.
- `invoke`: structured invocation metadata derived from the live Commander command tree when available, otherwise inferred from registry CLI hints.
- `runtime_adapter_id`: primary runtime adapter id.
- `runtime_aliases`: adapter ids that may appear in the live dispatcher.
- `active_in_runtime`: whether the capability is currently registered in the runtime.
- `execution_mode`, `ownership_model`, `owner_runtime`: execution boundary metadata.
- `authority_path`, `instruction_path`, `entrypoint_path`, `contract_path`: authority and implementation anchors.
- `contracts`, `tests`: supporting contract and verification references.

## Skill Info Payload

`skill-info --json` returns:

- `capability`: the same normalized discovery record used by `manifest`.
- `documentation`: the preferred contract surface for humans and tools.

`capability.invoke` includes:

- `source`: `commander`, `inferred`, or `unavailable`.
- `command_path`: the canonical shell command path after `cstar`.
- `aliases`: shell aliases such as `p1`.
- `options`: top-level options for the command family.
- `subcommands`: nested command contracts with their own options, arguments, examples, and JSON support flags.
- `examples`: recommended shell invocations for operators and agents.

`documentation.kind` values:

- `markdown`: Markdown or QMD contract material.
- `gherkin`: `.feature` contract material.
- `source`: runtime or implementation authority exists, but no Markdown/Gherkin contract is registered.
- `none`: no readable authority document was resolved.

## Resolution Rules

- Weaves prefer `.agents/weaves/<id>.md` when present.
- Spells prefer `.agents/spells/<id>.md`.
- Skills prefer their `instruction_path`.
- Kernel-backed entries with no prose contract fall back to their source authority path.
- `chant` is always exposed as `host-only`, even though it is runtime-backed, because its public surface is the host-native supervisor.

## Operator Guidance

- Use `manifest --json` for machine discovery.
- Use `skill-info <id> --json` when you need the invocation contract, authority files, and verification anchors for one capability.
- Treat `entry_surface=host-only` as a hard boundary: inspect it, but do not expect direct shell dispatch.
- Prefer `invoke.source=commander` over prose examples when both are present, because it is derived from the registered CLI command tree.
