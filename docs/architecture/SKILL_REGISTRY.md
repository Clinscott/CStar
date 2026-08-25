# CStar Skill Registry Contract

## Status

This document describes the current registry v3 contract. Older four-tier
inventories, autonomous skill-learning catalogs, and universal-runtime maps are
historical designs. They do not describe the active CStar surface.

## Boundary

`.agents/skill_registry.json` declares the reusable agent-native skills that a
host may discover. It is a capability declaration, not authority to execute,
mutate lifecycle state, spend, install, restart, or claim success.

CStar lifecycle authority remains in the kernel MCP contracts and Hall records.
The typed `cstar-kernel` tool catalog declares deterministic kernel primitives;
those tools do not need duplicate registry entries. Operator and repository
policy remains above both surfaces.

## Current Inventory

The active registry contains exactly three agent-native leaf skills:

| Skill | Purpose | Mutation boundary |
| --- | --- | --- |
| `corvus-forge` | Route bounded implementation through durable Forge request, execute, and independent validation. | Only CStar lifecycle tools and the sealed private Forge adapter may mutate within the authorized request. |
| `researcher` | Route bounded evidence work through authorized Researcher lanes. | Live collection and source-lane expansion remain separately gated. |
| `cstar-closeout` | Assemble evidence-backed handoff and closeout packets. | Stage, commit, push, merge, install, restart, and deploy are distinct operator gates. |

All three use:

- `tier: SKILL`;
- `entry_surface: host-only`;
- `execution.mode: agent-native`;
- `owner_runtime: host-agent`; and
- `recursion_policy: leaf`.

`host-only` means the active host reads the corresponding `SKILL.md` and follows
it in-session. It is not permission for `cstar run-skill`, a runtime adapter,
shell wrapper, model callback, or dynamic dispatcher to execute the skill.

## Routing

Registry intent grammar is advisory discovery metadata:

- build, repair, and evolve intents route to `corvus-forge` and the
  `cstar_forge_request` lifecycle;
- research intents route to `researcher` and `cstar_researcher_request`;
- documentation and handoff intents route to `cstar-closeout`; and
- deterministic observation, lifecycle, and validation intents route to the
  matching `cstar-kernel` primitive.

Augury may explain one of these routes when route or material scope is
ambiguous. Its output is non-actionable and cannot grant authority.

## Discovery

Use the following read-only discovery surfaces:

- `.agents/skill_registry.json` for the exact declared skill set;
- `cstar manifest --json` for the normalized registry view; and
- `cstar skill-info <id> --json` for one declared skill.

The current skills intentionally have no shell invocation metadata. A manifest
field such as `active_in_runtime` means the runtime recognizes the declaration;
it does not mean the runtime may execute the agent-native instructions.

## Retired Topology

The following are not active skills or alternate execution lanes:

- public AutoBot;
- One Mind delegation or fulfillment;
- Ravens autonomous cycles;
- model-memory harvest, engrave, distill, or dormancy loops;
- `chant`, `evolve`, `orchestrate`, restoration, expansion, vigilance, or other
  legacy mutation weaves; and
- recursive spells, skill learning, or automatic promotion.

Compatibility names may remain as read-only projections or fail-closed
tombstones. Their presence in source, historical records, or old documentation
does not restore capability or authority. MM is legacy, and PMTs are
project-scoped information repositories only.

## Change Rule

New reusable behavior starts as a reviewed skill with explicit inputs, outputs,
logs, failure classes, receipts, and focused tests. Promotion to an MCP tool
requires a separate bounded kernel contract and independent validation.
Registry edits alone cannot activate a host package: source generation, local
staging, installed/cache reconciliation, restart, live proof, and production
claims remain separate gates and evidence classes.
