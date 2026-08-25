# Retired Host and Model Compatibility Boundary

The former One Mind broker, Mimir client, host delegation bridges,
agent-native runtime dispatcher, PennyOne sampling callback, and blackboard
model compactor are import-compatible tombstones. The former adaptive
environment adapter is also terminal: it cannot infer subagent or JIT
capability from ambient variables or imported provider modules. These paths do
not provide an execution, persistence, routing, or recovery surface.

| Compatibility family | Stable failure |
| --- | --- |
| One Mind manager, fulfillment, and telemetry | `legacy_one_mind_compatibility_retired_use_cstar_kernel` |
| Host intelligence, Mimir, provider bridges, and delegated execution | `legacy_host_provider_delegation_retired_use_cstar_kernel` |
| Runtime agent-native callback dispatch | `legacy_agent_native_dispatch_retired_use_host_skill_surface` |
| Blackboard model compaction | `legacy_blackboard_compaction_retired_use_cstar_kernel` |
| Ambient environment capability inference | `legacy_environment_adapter_retired_use_host_enforceable_capabilities` |

Every effectful entrypoint stops before provider selection, process creation,
filesystem or Git access, Hall or StateRegistry mutation, source discovery, or
callback invocation. Compatibility results expose no successful-looking
fallback. Pure deterministic parsers and metadata helpers may remain where they
cannot route or mutate work.

Current work uses the active host conversation for host-only skills and the
typed `cstar-kernel` lifecycle for state. Build work uses
`cstar_forge_request -> cstar_forge_authorize -> cstar_forge_execute -> independent cstar_record_result`.
Research uses its authorized Researcher lane. Neither route may fall back to
One Mind, Mimir, a provider CLI, or a generic model callback.
