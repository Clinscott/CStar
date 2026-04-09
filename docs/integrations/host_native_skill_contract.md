# Host-Native Skill Contract

This is the authoritative invocation contract for any capability marked `entry_surface: host-only` in [`.agents/skill_registry.json`](/home/morderith/Corvus/CStar/.agents/skill_registry.json).

## Rule

`chant` and every other `host-only` capability must execute inside the active agent harness. They are not public shell commands.

## Codex Path

In Codex, host-native execution means:

1. The active agent reads the authoritative skill instructions and performs the work directly in-session.
2. The session maintains continuity through the canonical `corvus-host-plan` block.
3. The kernel records trace, Hall state, and subordinate bounded executions, but it does not become the public mind for the skill.

For `chant`, the instruction authority is [`.agents/skills/chant/SKILL.md`](/home/morderith/Corvus/CStar/.agents/skills/chant/SKILL.md).

## Runtime Bridge

When CStar needs to catalog a host-native activation, the runtime authority chain is:

1. [`RuntimeDispatcher.dispatch(SkillBead)`](/home/morderith/Corvus/CStar/src/node/core/runtime/dispatcher.ts)
2. `tryExecuteSkillBeadViaHostSession(...)`
3. [`buildHostNativeSkillPrompt(...)`](/home/morderith/Corvus/CStar/src/core/host_session.ts)
4. [`requestHostText(...)`](/home/morderith/Corvus/CStar/src/core/host_intelligence.ts)
5. [`MimirClient.request(...)`](/home/morderith/Corvus/CStar/src/core/mimir_client.ts)
6. An injected `hostSessionInvoker(prompt, provider)`

That injected `hostSessionInvoker` is the only non-shell Codex seam in the current TypeScript runtime.

## Forbidden Fallback

If no explicit `hostSessionInvoker` is bound, Codex can still use external shell transport in [`MimirClient.invokeHostSession(...)`](/home/morderith/Corvus/CStar/src/core/mimir_client.ts) unless the request is marked as harness-required.

That fallback is compatibility transport only. It is not the authoritative way to run `host-only` skills, and it must not be used for `chant`, trace designation, start/ravens/warden supervisor routing, host-governor review, architect proposal/review, or other trace-shaping planning workflows.

Trace-critical control-plane calls now mark `metadata.require_agent_harness = true` and `metadata.trace_critical = true`. For those requests, Codex must fail closed if no injected `hostSessionInvoker` is available. Neither shell transport nor `synapse_db` fallback is allowed.

The universal runtime adapter is registry catalog only for `agent-native` entries. It must not treat `execution.cli` as authority to execute an `agent-native` capability through the Node kernel.

## Shell Policy

Shell surfaces must fail closed for `host-only` capabilities.

- Generic shell dispatch already blocks `entry_surface=host-only` in [`src/node/core/commands/dispatcher.ts`](/home/morderith/Corvus/CStar/src/node/core/commands/dispatcher.ts).
- Direct skill execution must also block `host-only` capabilities in [`src/node/core/commands/run-skill.ts`](/home/morderith/Corvus/CStar/src/node/core/commands/run-skill.ts).

## Future Work

If Codex gains a first-class in-process callback from CStar into the active harness, bind that callback as `hostSessionInvoker` and keep this contract unchanged:

- Host-only skills still execute in the active agent session.
- The dispatcher still records trace and Hall lineage.
- Shell fallback remains forbidden for host-only and harness-required trace paths.
