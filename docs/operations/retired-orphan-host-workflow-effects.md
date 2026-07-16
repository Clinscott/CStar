# Retired Orphan Host Workflow Effects

Retiring an adapter is insufficient when its helper implementation remains
directly importable. The following orphan surfaces are therefore fail-closed
tombstones:

| Surface | Stable failure | Replacement |
| --- | --- | --- |
| Chant planning loop | `legacy_chant_planner_retired_use_host_native_skill` | host-native planning plus CStar lifecycle tools |
| Chant proposal artifacts | `legacy_chant_planner_artifacts_retired_use_cstar_kernel` | request-classified bead/proposal tools |
| Architect callback service | `legacy_architect_service_retired_use_host_native_skill` | host-native agent/subagent work |
| HostGovernor candidate helpers | `legacy_host_governor_candidates_retired_use_cstar_handoff` | `cstar_handoff`, `cstar_augury`, and explicit beads |
| PennyOne crawler | `legacy_pennyone_crawler_retired_use_cstar_hall_search` | bounded `cstar_hall_search` |
| PennyOne intent refresh | `legacy_pennyone_intent_refresh_retired_use_cstar_kernel` | a future request-classified skill/MCP contract |
| Economy/KeepOS ledger | `legacy_economy_effect_surface_retired_requires_operator_gate` | separately authorized project workflow |

Each failure happens before provider or callback invocation, process launch,
Git or source discovery, arbitrary target reads, proposal/report writes, Hall or
StateRegistry mutation, console emission, KeepOS writes, or in-memory ledger
mutation. Supplying a callback, project path, environment, model response, or
legacy policy object grants no authority.
