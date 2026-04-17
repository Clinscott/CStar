# CStar Evolution Watch

**Generated:** 2026-04-14 12:07:49 Canada/Eastern  

**CStar Root:** `/home/morderith/Corvus/CStar`  

**Total findings:** 624 (10 source findings + 614 probe findings)
**Probe sources:** registry_drift, import_boundaries, cross_spoke_coupling, runtime_bypass, trace_compliance


## Severity Summary

| Priority | Source Findings | Probe Findings |
|----------|-----------------|----------------|
| P1 | 3 (`f01`, `f08`, `f09`) | 1 (`PROBE_C__test_memory_partitioning.py`) |
| P2 | 5 (`f02`, `f03`, `f05`, `f06`, `f10`) | 295 (`PROBE_D__SKILL.md`, `PROBE_D__diagnostic.py`, `PROBE_D__HANDOFF.md`, `PROBE_D__HANDOFF.md`, `PROBE_D__cstar_inspection_2026-04-07.md`) |
| P3 | 2 (`f07`, `f11`) | 318 (`PROBE_B__jailing__jailing.py`, `PROBE_B__jailing__jailing.py`, `PROBE_B__jailing__jailing.py`, `PROBE_B__jailing__jailing.py`, `PROBE_B__metrics__metrics.py`) |

## Proactive Probe Findings (614)

### [CRITICAL] (1 findings)

#### Direct Engine bypass: 'KeepOS' imported in source file

**Probe:** `cross_spoke_coupling`  **Directory:** `tests`  

**Component:** `tests/unit/test_memory_partitioning.py`


**Description:** File imports 'KeepOS' directly — this is an Engine bypass violation. All spoke-to-spoke communication must go through the chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/tests/unit/test_memory_partitioning.py`

---

### [HIGH] (295 findings)

#### Registry bypass in SKILL.md

**Probe:** `runtime_bypass`  **Directory:** `.agents/skills`  

**Component:** `.agents/skills/manifest/SKILL.md`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/manifest/SKILL.md`

---

#### Registry bypass in diagnostic.py

**Probe:** `runtime_bypass`  **Directory:** `.agents/skills`  

**Component:** `.agents/skills/level-5-diagnostic/scripts/diagnostic.py`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/level-5-diagnostic/scripts/diagnostic.py`

---

#### Registry bypass in HANDOFF.md

**Probe:** `runtime_bypass`  **Directory:** `docs`  

**Component:** `docs/HANDOFF.md`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/docs/HANDOFF.md`

---

#### Registry bypass in HANDOFF.md

**Probe:** `runtime_bypass`  **Directory:** `docs`  

**Component:** `docs/HANDOFF.md`


**Description:** Found 'Bypassing chant.ts registry contract' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/docs/HANDOFF.md`

---

#### Registry bypass in cstar_inspection_2026-04-07.md

**Probe:** `runtime_bypass`  **Directory:** `docs`  

**Component:** `docs/reports/cstar_inspection_2026-04-07.md`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/docs/reports/cstar_inspection_2026-04-07.md`

---

#### Registry bypass in cstar_inspection_2026-04-07.md

**Probe:** `runtime_bypass`  **Directory:** `docs`  

**Component:** `docs/reports/cstar_inspection_2026-04-07.md`


**Description:** Found 'Bypassing chant.ts registry contract' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/docs/reports/cstar_inspection_2026-04-07.md`

---

#### Registry bypass in cstar_capability_discovery_api.md

**Probe:** `runtime_bypass`  **Directory:** `docs`  

**Component:** `docs/integrations/cstar_capability_discovery_api.md`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/docs/integrations/cstar_capability_discovery_api.md`

---

#### Registry bypass in cstar_capability_discovery_api.md

**Probe:** `runtime_bypass`  **Directory:** `docs`  

**Component:** `docs/integrations/cstar_capability_discovery_api.md`


**Description:** Found 'Bypassing chant.ts registry contract' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/docs/integrations/cstar_capability_discovery_api.md`

---

#### Registry bypass in host_native_skill_contract.md

**Probe:** `runtime_bypass`  **Directory:** `docs`  

**Component:** `docs/integrations/host_native_skill_contract.md`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/docs/integrations/host_native_skill_contract.md`

---

#### Registry bypass in host_native_skill_contract.md

**Probe:** `runtime_bypass`  **Directory:** `docs`  

**Component:** `docs/integrations/host_native_skill_contract.md`


**Description:** Found 'Bypassing chant.ts registry contract' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/docs/integrations/host_native_skill_contract.md`

---

#### Registry bypass in HOST_CONVERGENCE_BACKLOG.json

**Probe:** `runtime_bypass`  **Directory:** `docs`  

**Component:** `docs/architecture/HOST_CONVERGENCE_BACKLOG.json`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/docs/architecture/HOST_CONVERGENCE_BACKLOG.json`

---

#### Registry bypass in HOST_CONVERGENCE_BACKLOG.json

**Probe:** `runtime_bypass`  **Directory:** `docs`  

**Component:** `docs/architecture/HOST_CONVERGENCE_BACKLOG.json`


**Description:** Found 'Bypassing chant.ts registry contract' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/docs/architecture/HOST_CONVERGENCE_BACKLOG.json`

---

#### Registry bypass in SKILL_REGISTRY.md

**Probe:** `runtime_bypass`  **Directory:** `docs`  

**Component:** `docs/architecture/SKILL_REGISTRY.md`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/docs/architecture/SKILL_REGISTRY.md`

---

#### Registry bypass in SKILL_REGISTRY.md

**Probe:** `runtime_bypass`  **Directory:** `docs`  

**Component:** `docs/architecture/SKILL_REGISTRY.md`


**Description:** Found 'Bypassing chant.ts registry contract' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/docs/architecture/SKILL_REGISTRY.md`

---

#### Registry bypass in SKILL_PERMUTATIONS.md

**Probe:** `runtime_bypass`  **Directory:** `docs`  

**Component:** `docs/architecture/SKILL_PERMUTATIONS.md`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/docs/architecture/SKILL_PERMUTATIONS.md`

---

#### Registry bypass in HOST_CONVERGENCE_BACKLOG.qmd

**Probe:** `runtime_bypass`  **Directory:** `docs`  

**Component:** `docs/architecture/HOST_CONVERGENCE_BACKLOG.qmd`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/docs/architecture/HOST_CONVERGENCE_BACKLOG.qmd`

---

#### Registry bypass in HOST_CONVERGENCE_BACKLOG.qmd

**Probe:** `runtime_bypass`  **Directory:** `docs`  

**Component:** `docs/architecture/HOST_CONVERGENCE_BACKLOG.qmd`


**Description:** Found 'Bypassing chant.ts registry contract' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/docs/architecture/HOST_CONVERGENCE_BACKLOG.qmd`

---

#### Registry bypass in PHASE_1_IMPLEMENTATION_BACKLOG.qmd

**Probe:** `runtime_bypass`  **Directory:** `docs`  

**Component:** `docs/architecture/legacy_archive/PHASE_1_IMPLEMENTATION_BACKLOG.qmd`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/docs/architecture/legacy_archive/PHASE_1_IMPLEMENTATION_BACKLOG.qmd`

---

#### Registry bypass in PHASE_1_IMPLEMENTATION_BACKLOG.qmd

**Probe:** `runtime_bypass`  **Directory:** `docs`  

**Component:** `docs/architecture/legacy_archive/PHASE_1_IMPLEMENTATION_BACKLOG.qmd`


**Description:** Found 'Bypassing chant.ts registry contract' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/docs/architecture/legacy_archive/PHASE_1_IMPLEMENTATION_BACKLOG.qmd`

---

#### Registry bypass in test_release_bundles.test.ts

**Probe:** `runtime_bypass`  **Directory:** `tests`  

**Component:** `tests/unit/test_release_bundles.test.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/tests/unit/test_release_bundles.test.ts`

---

#### Registry bypass in test_host_session_runtime.test.ts

**Probe:** `runtime_bypass`  **Directory:** `tests`  

**Component:** `tests/unit/test_host_session_runtime.test.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/tests/unit/test_host_session_runtime.test.ts`

---

#### Registry bypass in test_distribution_manifests.test.ts

**Probe:** `runtime_bypass`  **Directory:** `tests`  

**Component:** `tests/unit/test_distribution_manifests.test.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/tests/unit/test_distribution_manifests.test.ts`

---

#### Registry bypass in test_runtime_dispatch.test.ts

**Probe:** `runtime_bypass`  **Directory:** `tests`  

**Component:** `tests/unit/test_runtime_dispatch.test.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/tests/unit/test_runtime_dispatch.test.ts`

---

#### Registry bypass in test_runtime_command_invocations.test.ts

**Probe:** `runtime_bypass`  **Directory:** `tests`  

**Component:** `tests/unit/test_runtime_command_invocations.test.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/tests/unit/test_runtime_command_invocations.test.ts`

---

#### Registry bypass in test_chant_runtime.test.ts

**Probe:** `runtime_bypass`  **Directory:** `tests`  

**Component:** `tests/unit/test_chant_runtime.test.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/tests/unit/test_chant_runtime.test.ts`

---

#### Registry bypass in test_release_archives.test.ts

**Probe:** `runtime_bypass`  **Directory:** `tests`  

**Component:** `tests/unit/test_release_archives.test.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/tests/unit/test_release_archives.test.ts`

---

#### Registry bypass in test_host_native_trace_lineage.test.ts

**Probe:** `runtime_bypass`  **Directory:** `tests`  

**Component:** `tests/unit/test_host_native_trace_lineage.test.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/tests/unit/test_host_native_trace_lineage.test.ts`

---

#### Registry bypass in test_chant_autobot_handoff.test.ts

**Probe:** `runtime_bypass`  **Directory:** `tests`  

**Component:** `tests/unit/test_chant_autobot_handoff.test.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/tests/unit/test_chant_autobot_handoff.test.ts`

---

#### Registry bypass in test_chant_stress_runtime.test.ts

**Probe:** `runtime_bypass`  **Directory:** `tests`  

**Component:** `tests/unit/test_chant_stress_runtime.test.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/tests/unit/test_chant_stress_runtime.test.ts`

---

#### Registry bypass in test_agent_browser.test.ts

**Probe:** `runtime_bypass`  **Directory:** `tests`  

**Component:** `tests/unit/test_agent_browser.test.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/tests/unit/test_agent_browser.test.ts`

---

#### Registry bypass in test_chant_host_native_dispatch.test.ts

**Probe:** `runtime_bypass`  **Directory:** `tests`  

**Component:** `tests/unit/test_chant_host_native_dispatch.test.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/tests/unit/test_chant_host_native_dispatch.test.ts`

---

#### Registry bypass in test_chant_planning_runtime.test.ts

**Probe:** `runtime_bypass`  **Directory:** `tests`  

**Component:** `tests/unit/test_chant_planning_runtime.test.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/tests/unit/test_chant_planning_runtime.test.ts`

---

#### Registry bypass in test_distribution_installers.test.ts

**Probe:** `runtime_bypass`  **Directory:** `tests`  

**Component:** `tests/unit/test_distribution_installers.test.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/tests/unit/test_distribution_installers.test.ts`

---

#### Registry bypass in test_dispatcher.test.ts

**Probe:** `runtime_bypass`  **Directory:** `tests`  

**Component:** `tests/unit/node-runtime/test_dispatcher.test.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/tests/unit/node-runtime/test_dispatcher.test.ts`

---

#### Registry bypass in cstar_dispatcher.py

**Probe:** `runtime_bypass`  **Directory:** `src`  

**Component:** `src/core/cstar_dispatcher.py`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/src/core/cstar_dispatcher.py`

---

#### Registry bypass in host_session.ts

**Probe:** `runtime_bypass`  **Directory:** `src`  

**Component:** `src/core/host_session.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/src/core/host_session.ts`

---

#### Registry bypass in distributions.ts

**Probe:** `runtime_bypass`  **Directory:** `src`  

**Component:** `src/packaging/distributions.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/src/packaging/distributions.ts`

---

#### Registry bypass in distributions.ts

**Probe:** `runtime_bypass`  **Directory:** `src`  

**Component:** `src/packaging/distributions.ts`


**Description:** Found 'Bypassing chant.ts registry contract' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/src/packaging/distributions.ts`

---

#### Registry bypass in capability_discovery.ts

**Probe:** `runtime_bypass`  **Directory:** `src`  

**Component:** `src/node/core/commands/capability_discovery.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/src/node/core/commands/capability_discovery.ts`

---

#### Registry bypass in bootstrap.ts

**Probe:** `runtime_bypass`  **Directory:** `src`  

**Component:** `src/node/core/runtime/bootstrap.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/src/node/core/runtime/bootstrap.ts`

---

#### Registry bypass in dispatcher.ts

**Probe:** `runtime_bypass`  **Directory:** `src`  

**Component:** `src/node/core/runtime/dispatcher.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/src/node/core/runtime/dispatcher.ts`

---

#### Registry bypass in entry_surface.ts

**Probe:** `runtime_bypass`  **Directory:** `src`  

**Component:** `src/node/core/runtime/entry_surface.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/src/node/core/runtime/entry_surface.ts`

---

#### Registry bypass in legacy_commands.ts

**Probe:** `runtime_bypass`  **Directory:** `src`  

**Component:** `src/node/core/runtime/adapters/legacy_commands.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/src/node/core/runtime/adapters/legacy_commands.ts`

---

#### Registry bypass in chant_parser.ts

**Probe:** `runtime_bypass`  **Directory:** `src`  

**Component:** `src/node/core/runtime/host_workflows/chant_parser.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/src/node/core/runtime/host_workflows/chant_parser.ts`

---

#### Registry bypass in search.ts

**Probe:** `runtime_bypass`  **Directory:** `src`  

**Component:** `src/tools/pennyone/live/search.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/src/tools/pennyone/live/search.ts`

---

#### Registry bypass in search.ts

**Probe:** `runtime_bypass`  **Directory:** `src`  

**Component:** `src/tools/pennyone/live/search.ts`


**Description:** Found 'Bypassing chant.ts registry contract' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/src/tools/pennyone/live/search.ts`

---

#### Registry bypass in repository_manager.ts

**Probe:** `runtime_bypass`  **Directory:** `src`  

**Component:** `src/tools/pennyone/intel/repository_manager.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/src/tools/pennyone/intel/repository_manager.ts`

---

#### Registry bypass in repository_manager.ts

**Probe:** `runtime_bypass`  **Directory:** `src`  

**Component:** `src/tools/pennyone/intel/repository_manager.ts`


**Description:** Found 'Bypassing chant.ts registry contract' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/src/tools/pennyone/intel/repository_manager.ts`

---

#### Registry bypass in session_manager.ts

**Probe:** `runtime_bypass`  **Directory:** `src`  

**Component:** `src/tools/pennyone/intel/session_manager.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/src/tools/pennyone/intel/session_manager.ts`

---

#### Registry bypass in session_manager.ts

**Probe:** `runtime_bypass`  **Directory:** `src`  

**Component:** `src/tools/pennyone/intel/session_manager.ts`


**Description:** Found 'Bypassing chant.ts registry contract' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/src/tools/pennyone/intel/session_manager.ts`

---

#### Registry bypass in bead_controller.ts

**Probe:** `runtime_bypass`  **Directory:** `src`  

**Component:** `src/tools/pennyone/intel/bead_controller.ts`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/src/tools/pennyone/intel/bead_controller.ts`

---

#### Registry bypass in bead_controller.ts

**Probe:** `runtime_bypass`  **Directory:** `src`  

**Component:** `src/tools/pennyone/intel/bead_controller.ts`


**Description:** Found 'Bypassing chant.ts registry contract' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/src/tools/pennyone/intel/bead_controller.ts`

---

#### Registry bypass in memory_db.py

**Probe:** `runtime_bypass`  **Directory:** `src`  

**Component:** `src/core/engine/memory_db.py`


**Description:** Found 'Direct skill_registry access at runtime' pattern in this file — runtime skill dispatch should flow through chant.ts registry contract.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/memory_db.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/__init__.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/__init__.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/cstar/__init__.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/cstar/__init__.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/skills/__init__.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/skills/__init__.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/skills/install_skill.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/skills/install_skill.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/skills/skill_forge.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/skills/skill_forge.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/synapse/synapse_auth.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/synapse/synapse_auth.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/synapse/__init__.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/synapse/__init__.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/synapse/synapse_sync.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/synapse/synapse_sync.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/games/__init__.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/games/__init__.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/sentinel_perf.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/sentinel_perf.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/danger_room.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/danger_room.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/benchmark_engine.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/benchmark_engine.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/user_feedback.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/user_feedback.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/__init__.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/__init__.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/network_watcher.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/network_watcher.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/list_models.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/list_models.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/lightning_rod.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/lightning_rod.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/archive_consolidator.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/archive_consolidator.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/utility_belt.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/utility_belt.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/loop.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/loop.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/compile_session_traces.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/compile_session_traces.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/compile_failure_report.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/compile_failure_report.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/generate_tests.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/generate_tests.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/perimeter_sweep.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/perimeter_sweep.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/trace_viz.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/trace_viz.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/merge_traces.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/merge_traces.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/voice_check.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/voice_check.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/tune_weights.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/tune_weights.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/debt_viz.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/debt_viz.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/wrap_it_up.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/wrap_it_up.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/update_gemini_manifest.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/update_gemini_manifest.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/gemini_search.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/gemini_search.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/latency_check.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/latency_check.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/code_sentinel.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/code_sentinel.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/migrate_to_qmd.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/migrate_to_qmd.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/brave_search.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/brave_search.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/vault.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/vault.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/security_scan.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/security_scan.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/acquire.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/acquire.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/overwatch.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/overwatch.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/crucible/__init__.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/crucible/__init__.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/annex.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/annex.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/payload.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/payload.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/vitals_spoke.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/vitals_spoke.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/redactor.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/redactor.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/__init__.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/__init__.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/metrics.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/metrics.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/promotion_registry.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/promotion_registry.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/norn_coordinator.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/norn_coordinator.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/utils.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/utils.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/cstar_dispatcher.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/cstar_dispatcher.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/one_mind_bridge.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/one_mind_bridge.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/sovereign_hud.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/sovereign_hud.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/sv_engine.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/sv_engine.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/edda.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/edda.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/host_session.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/host_session.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/runtime_env.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/runtime_env.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/synapse_db.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/synapse_db.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/mimir_client.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/mimir_client.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/telemetry.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/telemetry.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/lease_manager.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/lease_manager.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/prompt_linter.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/prompt_linter.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/kernel_bridge.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/kernel_bridge.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/bootstrap.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/bootstrap.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/set_persona.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/set_persona.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/personas.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/personas.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/sterling_auditor.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/sterling_auditor.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/report_engine.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/report_engine.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/cstar/core/rpc.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/cstar/core/rpc.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/cstar/core/__init__.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/cstar/core/__init__.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/cstar/core/uplink.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/cstar/core/uplink.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/skills/local/dormancy.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/skills/local/dormancy.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/skills/local/KnowledgeHunter/hunter.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/skills/local/KnowledgeHunter/hunter.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/skills/local/VisualExplainer/visual_explainer.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/skills/local/VisualExplainer/visual_explainer.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/skills/local/WildHunt/wild_hunt.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/skills/local/WildHunt/wild_hunt.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/skills/local/CacheBro/cache_bro.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/skills/local/CacheBro/cache_bro.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/skills/local/workflow_analyst/analyze_workflow.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/skills/local/workflow_analyst/analyze_workflow.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/skills/local/SkillLearning/learn.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/skills/local/SkillLearning/learn.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/skills/local/CStarEvolutionWatch/scripts/evolution_watch.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/skills/local/CStarEvolutionWatch/scripts/evolution_watch.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/games/odin_protocol/main.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/games/odin_protocol/main.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/games/odin_protocol/ui.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/games/odin_protocol/ui.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/games/odin_protocol/engine/scenarios.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/games/odin_protocol/engine/scenarios.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/games/odin_protocol/engine/__init__.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/games/odin_protocol/engine/__init__.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/games/odin_protocol/engine/models.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/games/odin_protocol/engine/models.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/games/odin_protocol/engine/rng.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/games/odin_protocol/engine/rng.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/games/odin_protocol/engine/campaign_updater.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/games/odin_protocol/engine/campaign_updater.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/games/odin_protocol/engine/logic.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/games/odin_protocol/engine/logic.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/games/odin_protocol/engine/gm_client.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/games/odin_protocol/engine/gm_client.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/games/odin_protocol/engine/persistence.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/games/odin_protocol/engine/persistence.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/games/odin_protocol/engine/adjudicator.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/games/odin_protocol/engine/adjudicator.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/debug/__init__.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/debug/__init__.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/debug/diag_engine.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/debug/diag_engine.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/debug/quick_check.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/debug/quick_check.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/debug/catalog_check.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/debug/catalog_check.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/debug/audit_dialogue.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/debug/audit_dialogue.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/debug/cjk_check.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/debug/cjk_check.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/debug/debug_engine.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/debug/debug_engine.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/debug/debug_fishtest_phase2.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/debug/debug_fishtest_phase2.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/debug/verify_fish.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/debug/verify_fish.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/debug/debug_perf.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/debug/debug_perf.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/debug/collision_investigator.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/debug/collision_investigator.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/debug/debug_fishtest.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/debug/debug_fishtest.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/debug/check_pro.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/debug/check_pro.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/debug/runecaster_audit.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/debug/runecaster_audit.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/data/overfit_corrections.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/data/overfit_corrections.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/data/__init__.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/data/__init__.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/data/sanitize_thesaurus.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/data/sanitize_thesaurus.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/data/expand_thesaurus.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/data/expand_thesaurus.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/tools/data/dedupe_corrections.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/tools/data/dedupe_corrections.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/atomic_gpt.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/atomic_gpt.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/cognitive_router.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/cognitive_router.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/validation_result.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/validation_result.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/skill_learning.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/skill_learning.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/memory_db.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/memory_db.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/builder.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/builder.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/__init__.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/__init__.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/dialogue.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/dialogue.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/evolve_skill.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/evolve_skill.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/instruction_loader.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/instruction_loader.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/cortex.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/cortex.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/vector_shadow.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/vector_shadow.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/ravens_stage.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/ravens_stage.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/vector.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/vector.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/autobot_skill.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/autobot_skill.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/reporter.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/reporter.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/injector.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/injector.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/heimdall_shield.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/heimdall_shield.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/vector_router.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/vector_router.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/bead_ledger.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/bead_ledger.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/context.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/context.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/hall_schema.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/hall_schema.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/forge_candidate.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/forge_candidate.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/bifrost.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/bifrost.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/vector_config.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/vector_config.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/executor.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/executor.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/vector_ingest.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/vector_ingest.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/sovereign_worker.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/sovereign_worker.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/vector_calculus.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/vector_calculus.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/orchestrator.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/orchestrator.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/env_adapter.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/env_adapter.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/gungnir/ledger.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/gungnir/ledger.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/gungnir/schema.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/gungnir/schema.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/gungnir/universal.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/gungnir/universal.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/utils/sandbox_warden.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/utils/sandbox_warden.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/utils/stability.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/utils/stability.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/utils/code_sanitizer.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/utils/code_sanitizer.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/ravens/stability.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/ravens/stability.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/ravens/ravens_runtime.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/ravens/ravens_runtime.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/ravens/repo_spoke.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/ravens/repo_spoke.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/ravens/muninn_crucible.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/ravens/muninn_crucible.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/ravens/muninn.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/ravens/muninn.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/ravens/muninn_memory.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/ravens/muninn_memory.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/ravens/score_cohesion.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/ravens/score_cohesion.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/ravens/coordinator.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/ravens/coordinator.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/ravens/git_spoke.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/ravens/git_spoke.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/ravens/muninn_promotion.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/ravens/muninn_promotion.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/ravens/muninn_hunter.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/ravens/muninn_hunter.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/ravens/ravens_cycle.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/ravens/ravens_cycle.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/ravens/muninn_heart.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/ravens/muninn_heart.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/diagnostic/harvest_responses.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/diagnostic/harvest_responses.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/wardens/scour.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/wardens/scour.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/wardens/__init__.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/wardens/__init__.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/wardens/runecaster.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/wardens/runecaster.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/wardens/freya.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/wardens/freya.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/wardens/base.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/wardens/base.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/wardens/valkyrie.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/wardens/valkyrie.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/wardens/edda.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/wardens/edda.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/wardens/taste.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/wardens/taste.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/wardens/mimir.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/wardens/mimir.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/wardens/security.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/wardens/security.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/wardens/shadow_forge.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/wardens/shadow_forge.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/wardens/norn.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/wardens/norn.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/wardens/huginn.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/wardens/huginn.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `src/`  

**Component:** `src/core/engine/wardens/ghost_warden.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/src/core/engine/wardens/ghost_warden.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/forge_staged/ouroboros.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/forge_staged/ouroboros.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/forge_staged/vector.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/forge_staged/vector.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/jailing/scripts/jailing.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/jailing/scripts/jailing.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/metrics/scripts/metrics.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/metrics/scripts/metrics.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/oracle/scripts/oracle.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/oracle/scripts/oracle.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/research/scripts/research.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/research/scripts/research.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/taliesin/scripts/taliesin_main.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/taliesin_main.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/taliesin/scripts/x_api.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/x_api.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/taliesin/scripts/taliesin_spoke.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/taliesin_spoke.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/taliesin/scripts/taliesin_forge.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/taliesin_forge.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/taliesin/scripts/recreate_chapter.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/recreate_chapter.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/personas/scripts/personas.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/personas/scripts/personas.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/chronicle/scripts/chronicle.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/chronicle/scripts/chronicle.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/promotion/scripts/promotion.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/promotion/scripts/promotion.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/linter/scripts/linter.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/linter/scripts/linter.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/forge/scripts/forge.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/forge/scripts/forge.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/hunt/scripts/hunt.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/hunt/scripts/hunt.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/corvus-control/scripts/resolve_cstar.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/corvus-control/scripts/resolve_cstar.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/_archive/_loose_scripts/daemon.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/daemon.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/_archive/_loose_scripts/network.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/network.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/_archive/_loose_scripts/ravens.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/ravens.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/_archive/_loose_scripts/unblock.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/unblock.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/_archive/_loose_scripts/synapse.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/synapse.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/_archive/_loose_scripts/_template.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/_template.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/_archive/_loose_scripts/banana.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/banana.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/_archive/_loose_scripts/trace.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/trace.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/_archive/_loose_scripts/audit.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/audit.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/_archive/_loose_scripts/persona.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/persona.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/_archive/_loose_scripts/huginn.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/huginn.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/_archive/_loose_scripts/heimdall.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/heimdall.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/warden/scripts/warden.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/warden/scripts/warden.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/qmd_search/scripts/qmd_search.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/qmd_search/scripts/qmd_search.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/ravens/scripts/ravens.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ravens/scripts/ravens.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/bookmark-weaver/scripts/weaver.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/bookmark-weaver/scripts/weaver.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/redactor/scripts/redactor.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/redactor/scripts/redactor.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/scan/scripts/scan.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/scan/scripts/scan.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/chant/scripts/chant.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/chant/scripts/chant.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/norn/scripts/norn.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/norn/scripts/norn.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/sprt/scripts/sprt.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/sprt/scripts/sprt.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/evolve/scripts/evolve.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/evolve/scripts/evolve.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/edda/scripts/edda.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/edda/scripts/edda.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/ritual/scripts/ritual.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ritual/scripts/ritual.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/locks/scripts/locks.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/locks/scripts/locks.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/annex/scripts/annex.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/annex/scripts/annex.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/style/scripts/style.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/style/scripts/style.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/scribe/scripts/memory.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/scribe/scripts/memory.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/autobot/scripts/autobot.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/autobot/scripts/autobot.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/stability/scripts/stability.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/stability/scripts/stability.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/level-5-diagnostic/scripts/diagnostic.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/level-5-diagnostic/scripts/diagnostic.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/level-5-diagnostic/scripts/vigilance_auditor.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/level-5-diagnostic/scripts/vigilance_auditor.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/telemetry/scripts/telemetry.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/telemetry/scripts/telemetry.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/calculus/scripts/calculus.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/calculus/scripts/calculus.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/one-mind/scripts/fulfill.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/one-mind/scripts/fulfill.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/one-mind/scripts/ingest.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/one-mind/scripts/ingest.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/trace/scripts/trace.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/trace/scripts/trace.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/matrix/scripts/matrix.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/matrix/scripts/matrix.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/artifact-forge/scripts/forge.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/artifact-forge/scripts/forge.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/taliesin-optimizer/scripts/manuscript_optimizer.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin-optimizer/scripts/manuscript_optimizer.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/taliesin-optimizer/scripts/taliesin_optimizer.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin-optimizer/scripts/taliesin_optimizer.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/sterling/scripts/sterling.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/sterling/scripts/sterling.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/consciousness/scripts/consciousness.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/consciousness/scripts/consciousness.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/report/scripts/report.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/report/scripts/report.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/skills/empire/scripts/empire.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/empire/scripts/empire.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/scripts/empire/compiler.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/scripts/empire/compiler.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/scripts/empire/symbolic_legend.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/scripts/empire/symbolic_legend.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/scripts/empire/factories.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/scripts/empire/factories.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/scripts/empire/stabilizer.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/scripts/empire/stabilizer.py`

---

#### Modified file missing Corvus Star Trace block

**Probe:** `trace_compliance`  **Directory:** `.agents/`  

**Component:** `.agents/scripts/empire/semantic_probe.py`


**Description:** This file was modified but contains no Corvus Star Trace comment block. Per the Trace Enforcement rule, every multi-file change must emit a Trace block.

**File:** `/home/morderith/Corvus/CStar/.agents/scripts/empire/semantic_probe.py`

---

### [MEDIUM] (318 findings)

#### Skill 'jailing' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/jailing/scripts/jailing.py`


**Description:** jailing.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/jailing/scripts/jailing.py`

---

#### Skill 'jailing' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/jailing/scripts/jailing.py`


**Description:** jailing.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/jailing/scripts/jailing.py`

---

#### Skill 'jailing' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/jailing/scripts/jailing.py`


**Description:** jailing.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/jailing/scripts/jailing.py`

---

#### Skill 'jailing' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/jailing/scripts/jailing.py`


**Description:** jailing.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/jailing/scripts/jailing.py`

---

#### Skill 'metrics' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/metrics/scripts/metrics.py`


**Description:** metrics.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/metrics/scripts/metrics.py`

---

#### Skill 'metrics' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/metrics/scripts/metrics.py`


**Description:** metrics.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/metrics/scripts/metrics.py`

---

#### Skill 'metrics' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/metrics/scripts/metrics.py`


**Description:** metrics.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/metrics/scripts/metrics.py`

---

#### Skill 'metrics' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/metrics/scripts/metrics.py`


**Description:** metrics.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/metrics/scripts/metrics.py`

---

#### Skill 'metrics' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/metrics/scripts/metrics.py`


**Description:** metrics.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/metrics/scripts/metrics.py`

---

#### Skill 'oracle' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/oracle/scripts/oracle.py`


**Description:** oracle.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/oracle/scripts/oracle.py`

---

#### Skill 'oracle' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/oracle/scripts/oracle.py`


**Description:** oracle.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/oracle/scripts/oracle.py`

---

#### Skill 'oracle' imports external module 'subprocess'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/oracle/scripts/oracle.py`


**Description:** oracle.py imports 'subprocess' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/oracle/scripts/oracle.py`

---

#### Skill 'oracle' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/oracle/scripts/oracle.py`


**Description:** oracle.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/oracle/scripts/oracle.py`

---

#### Skill 'oracle' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/oracle/scripts/oracle.py`


**Description:** oracle.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/oracle/scripts/oracle.py`

---

#### Skill 'oracle' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/oracle/scripts/oracle.py`


**Description:** oracle.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/oracle/scripts/oracle.py`

---

#### Skill 'research' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/research/scripts/research.py`


**Description:** research.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/research/scripts/research.py`

---

#### Skill 'research' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/research/scripts/research.py`


**Description:** research.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/research/scripts/research.py`

---

#### Skill 'research' imports external module 'os'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/research/scripts/research.py`


**Description:** research.py imports 'os' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/research/scripts/research.py`

---

#### Skill 'research' imports external module 'subprocess'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/research/scripts/research.py`


**Description:** research.py imports 'subprocess' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/research/scripts/research.py`

---

#### Skill 'research' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/research/scripts/research.py`


**Description:** research.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/research/scripts/research.py`

---

#### Skill 'research' imports external module 'time'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/research/scripts/research.py`


**Description:** research.py imports 'time' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/research/scripts/research.py`

---

#### Skill 'research' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/research/scripts/research.py`


**Description:** research.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/research/scripts/research.py`

---

#### Skill 'taliesin' imports external module 'runpy'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/taliesin_main.py`


**Description:** taliesin_main.py imports 'runpy' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/taliesin_main.py`

---

#### Skill 'taliesin' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/taliesin_main.py`


**Description:** taliesin_main.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/taliesin_main.py`

---

#### Skill 'taliesin' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/taliesin_main.py`


**Description:** taliesin_main.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/taliesin_main.py`

---

#### Skill 'taliesin' imports external module 'os'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/x_api.py`


**Description:** x_api.py imports 'os' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/x_api.py`

---

#### Skill 'taliesin' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/x_api.py`


**Description:** x_api.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/x_api.py`

---

#### Skill 'taliesin' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/taliesin_spoke.py`


**Description:** taliesin_spoke.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/taliesin_spoke.py`

---

#### Skill 'taliesin' imports external module 'os'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/taliesin_spoke.py`


**Description:** taliesin_spoke.py imports 'os' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/taliesin_spoke.py`

---

#### Skill 'taliesin' imports external module 're'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/taliesin_spoke.py`


**Description:** taliesin_spoke.py imports 're' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/taliesin_spoke.py`

---

#### Skill 'taliesin' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/taliesin_spoke.py`


**Description:** taliesin_spoke.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/taliesin_spoke.py`

---

#### Skill 'taliesin' imports external module 'time'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/taliesin_spoke.py`


**Description:** taliesin_spoke.py imports 'time' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/taliesin_spoke.py`

---

#### Skill 'taliesin' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/taliesin_spoke.py`


**Description:** taliesin_spoke.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/taliesin_spoke.py`

---

#### Skill 'taliesin' imports external module 'typing'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/taliesin_spoke.py`


**Description:** taliesin_spoke.py imports 'typing' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/taliesin_spoke.py`

---

#### Skill 'taliesin' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/taliesin_spoke.py`


**Description:** taliesin_spoke.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/taliesin_spoke.py`

---

#### Skill 'taliesin' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/taliesin_spoke.py`


**Description:** taliesin_spoke.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/taliesin_spoke.py`

---

#### Skill 'taliesin' imports external module 'x_api'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/taliesin_spoke.py`


**Description:** taliesin_spoke.py imports 'x_api' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/taliesin_spoke.py`

---

#### Skill 'taliesin' imports external module 'runpy'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/taliesin_forge.py`


**Description:** taliesin_forge.py imports 'runpy' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/taliesin_forge.py`

---

#### Skill 'taliesin' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/taliesin_forge.py`


**Description:** taliesin_forge.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/taliesin_forge.py`

---

#### Skill 'taliesin' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/taliesin_forge.py`


**Description:** taliesin_forge.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/taliesin_forge.py`

---

#### Skill 'taliesin' imports external module 'asyncio'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/recreate_chapter.py`


**Description:** recreate_chapter.py imports 'asyncio' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/recreate_chapter.py`

---

#### Skill 'taliesin' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/recreate_chapter.py`


**Description:** recreate_chapter.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/recreate_chapter.py`

---

#### Skill 'taliesin' imports external module 'os'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/recreate_chapter.py`


**Description:** recreate_chapter.py imports 'os' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/recreate_chapter.py`

---

#### Skill 'taliesin' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/recreate_chapter.py`


**Description:** recreate_chapter.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/recreate_chapter.py`

---

#### Skill 'taliesin' imports external module 'typing'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/recreate_chapter.py`


**Description:** recreate_chapter.py imports 'typing' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/recreate_chapter.py`

---

#### Skill 'taliesin' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/recreate_chapter.py`


**Description:** recreate_chapter.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/recreate_chapter.py`

---

#### Skill 'taliesin' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/recreate_chapter.py`


**Description:** recreate_chapter.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/recreate_chapter.py`

---

#### Skill 'taliesin' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin/scripts/recreate_chapter.py`


**Description:** recreate_chapter.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin/scripts/recreate_chapter.py`

---

#### Skill 'personas' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/personas/scripts/personas.py`


**Description:** personas.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/personas/scripts/personas.py`

---

#### Skill 'personas' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/personas/scripts/personas.py`


**Description:** personas.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/personas/scripts/personas.py`

---

#### Skill 'personas' imports external module 'subprocess'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/personas/scripts/personas.py`


**Description:** personas.py imports 'subprocess' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/personas/scripts/personas.py`

---

#### Skill 'personas' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/personas/scripts/personas.py`


**Description:** personas.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/personas/scripts/personas.py`

---

#### Skill 'personas' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/personas/scripts/personas.py`


**Description:** personas.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/personas/scripts/personas.py`

---

#### Skill 'personas' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/personas/scripts/personas.py`


**Description:** personas.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/personas/scripts/personas.py`

---

#### Skill 'chronicle' imports external module 'os'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/chronicle/scripts/chronicle.py`


**Description:** chronicle.py imports 'os' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/chronicle/scripts/chronicle.py`

---

#### Skill 'chronicle' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/chronicle/scripts/chronicle.py`


**Description:** chronicle.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/chronicle/scripts/chronicle.py`

---

#### Skill 'chronicle' imports external module 're'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/chronicle/scripts/chronicle.py`


**Description:** chronicle.py imports 're' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/chronicle/scripts/chronicle.py`

---

#### Skill 'chronicle' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/chronicle/scripts/chronicle.py`


**Description:** chronicle.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/chronicle/scripts/chronicle.py`

---

#### Skill 'chronicle' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/chronicle/scripts/chronicle.py`


**Description:** chronicle.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/chronicle/scripts/chronicle.py`

---

#### Skill 'chronicle' imports external module 'typing'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/chronicle/scripts/chronicle.py`


**Description:** chronicle.py imports 'typing' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/chronicle/scripts/chronicle.py`

---

#### Skill 'promotion' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/promotion/scripts/promotion.py`


**Description:** promotion.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/promotion/scripts/promotion.py`

---

#### Skill 'promotion' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/promotion/scripts/promotion.py`


**Description:** promotion.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/promotion/scripts/promotion.py`

---

#### Skill 'promotion' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/promotion/scripts/promotion.py`


**Description:** promotion.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/promotion/scripts/promotion.py`

---

#### Skill 'promotion' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/promotion/scripts/promotion.py`


**Description:** promotion.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/promotion/scripts/promotion.py`

---

#### Skill 'linter' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/linter/scripts/linter.py`


**Description:** linter.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/linter/scripts/linter.py`

---

#### Skill 'linter' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/linter/scripts/linter.py`


**Description:** linter.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/linter/scripts/linter.py`

---

#### Skill 'linter' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/linter/scripts/linter.py`


**Description:** linter.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/linter/scripts/linter.py`

---

#### Skill 'linter' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/linter/scripts/linter.py`


**Description:** linter.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/linter/scripts/linter.py`

---

#### Skill 'linter' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/linter/scripts/linter.py`


**Description:** linter.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/linter/scripts/linter.py`

---

#### Skill 'forge' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/forge/scripts/forge.py`


**Description:** forge.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/forge/scripts/forge.py`

---

#### Skill 'forge' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/forge/scripts/forge.py`


**Description:** forge.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/forge/scripts/forge.py`

---

#### Skill 'forge' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/forge/scripts/forge.py`


**Description:** forge.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/forge/scripts/forge.py`

---

#### Skill 'forge' imports external module 'subprocess'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/forge/scripts/forge.py`


**Description:** forge.py imports 'subprocess' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/forge/scripts/forge.py`

---

#### Skill 'forge' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/forge/scripts/forge.py`


**Description:** forge.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/forge/scripts/forge.py`

---

#### Skill 'forge' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/forge/scripts/forge.py`


**Description:** forge.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/forge/scripts/forge.py`

---

#### Skill 'forge' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/forge/scripts/forge.py`


**Description:** forge.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/forge/scripts/forge.py`

---

#### Skill 'hunt' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/hunt/scripts/hunt.py`


**Description:** hunt.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/hunt/scripts/hunt.py`

---

#### Skill 'hunt' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/hunt/scripts/hunt.py`


**Description:** hunt.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/hunt/scripts/hunt.py`

---

#### Skill 'hunt' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/hunt/scripts/hunt.py`


**Description:** hunt.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/hunt/scripts/hunt.py`

---

#### Skill 'hunt' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/hunt/scripts/hunt.py`


**Description:** hunt.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/hunt/scripts/hunt.py`

---

#### Skill 'corvus-control' imports external module 'subprocess'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/corvus-control/scripts/resolve_cstar.py`


**Description:** resolve_cstar.py imports 'subprocess' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/corvus-control/scripts/resolve_cstar.py`

---

#### Skill 'corvus-control' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/corvus-control/scripts/resolve_cstar.py`


**Description:** resolve_cstar.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/corvus-control/scripts/resolve_cstar.py`

---

#### Skill 'corvus-control' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/corvus-control/scripts/resolve_cstar.py`


**Description:** resolve_cstar.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/corvus-control/scripts/resolve_cstar.py`

---

#### Skill 'corvus-control' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/corvus-control/scripts/resolve_cstar.py`


**Description:** resolve_cstar.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/corvus-control/scripts/resolve_cstar.py`

---

#### Skill '_archive' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/daemon.py`


**Description:** daemon.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/daemon.py`

---

#### Skill '_archive' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/daemon.py`


**Description:** daemon.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/daemon.py`

---

#### Skill '_archive' imports external module 'runpy'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/network.py`


**Description:** network.py imports 'runpy' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/network.py`

---

#### Skill '_archive' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/network.py`


**Description:** network.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/network.py`

---

#### Skill '_archive' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/network.py`


**Description:** network.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/network.py`

---

#### Skill '_archive' imports external module 'subprocess'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/ravens.py`


**Description:** ravens.py imports 'subprocess' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/ravens.py`

---

#### Skill '_archive' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/ravens.py`


**Description:** ravens.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/ravens.py`

---

#### Skill '_archive' imports external module 'time'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/ravens.py`


**Description:** ravens.py imports 'time' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/ravens.py`

---

#### Skill '_archive' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/ravens.py`


**Description:** ravens.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/ravens.py`

---

#### Skill '_archive' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/ravens.py`


**Description:** ravens.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/ravens.py`

---

#### Skill '_archive' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/ravens.py`


**Description:** ravens.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/ravens.py`

---

#### Skill '_archive' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/unblock.py`


**Description:** unblock.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/unblock.py`

---

#### Skill '_archive' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/unblock.py`


**Description:** unblock.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/unblock.py`

---

#### Skill '_archive' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/unblock.py`


**Description:** unblock.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/unblock.py`

---

#### Skill '_archive' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/unblock.py`


**Description:** unblock.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/unblock.py`

---

#### Skill '_archive' imports external module 'runpy'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/synapse.py`


**Description:** synapse.py imports 'runpy' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/synapse.py`

---

#### Skill '_archive' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/synapse.py`


**Description:** synapse.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/synapse.py`

---

#### Skill '_archive' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/synapse.py`


**Description:** synapse.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/synapse.py`

---

#### Skill '_archive' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/_template.py`


**Description:** _template.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/_template.py`

---

#### Skill '_archive' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/_template.py`


**Description:** _template.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/_template.py`

---

#### Skill '_archive' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/_template.py`


**Description:** _template.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/_template.py`

---

#### Skill '_archive' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/banana.py`


**Description:** banana.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/banana.py`

---

#### Skill '_archive' imports external module 'runpy'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/trace.py`


**Description:** trace.py imports 'runpy' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/trace.py`

---

#### Skill '_archive' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/trace.py`


**Description:** trace.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/trace.py`

---

#### Skill '_archive' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/trace.py`


**Description:** trace.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/trace.py`

---

#### Skill '_archive' imports external module 'runpy'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/audit.py`


**Description:** audit.py imports 'runpy' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/audit.py`

---

#### Skill '_archive' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/audit.py`


**Description:** audit.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/audit.py`

---

#### Skill '_archive' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/audit.py`


**Description:** audit.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/audit.py`

---

#### Skill '_archive' imports external module 'subprocess'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/persona.py`


**Description:** persona.py imports 'subprocess' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/persona.py`

---

#### Skill '_archive' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/persona.py`


**Description:** persona.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/persona.py`

---

#### Skill '_archive' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/persona.py`


**Description:** persona.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/persona.py`

---

#### Skill '_archive' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/huginn.py`


**Description:** huginn.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/huginn.py`

---

#### Skill '_archive' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/huginn.py`


**Description:** huginn.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/huginn.py`

---

#### Skill '_archive' imports external module 'runpy'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/heimdall.py`


**Description:** heimdall.py imports 'runpy' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/heimdall.py`

---

#### Skill '_archive' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/heimdall.py`


**Description:** heimdall.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/heimdall.py`

---

#### Skill '_archive' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/_archive/_loose_scripts/heimdall.py`


**Description:** heimdall.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/_archive/_loose_scripts/heimdall.py`

---

#### Skill 'warden' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/warden/scripts/warden.py`


**Description:** warden.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/warden/scripts/warden.py`

---

#### Skill 'warden' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/warden/scripts/warden.py`


**Description:** warden.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/warden/scripts/warden.py`

---

#### Skill 'warden' imports external module 'asyncio'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/warden/scripts/warden.py`


**Description:** warden.py imports 'asyncio' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/warden/scripts/warden.py`

---

#### Skill 'warden' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/warden/scripts/warden.py`


**Description:** warden.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/warden/scripts/warden.py`

---

#### Skill 'warden' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/warden/scripts/warden.py`


**Description:** warden.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/warden/scripts/warden.py`

---

#### Skill 'warden' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/warden/scripts/warden.py`


**Description:** warden.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/warden/scripts/warden.py`

---

#### Skill 'qmd_search' imports external module 'os'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/qmd_search/scripts/qmd_search.py`


**Description:** qmd_search.py imports 'os' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/qmd_search/scripts/qmd_search.py`

---

#### Skill 'qmd_search' imports external module 're'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/qmd_search/scripts/qmd_search.py`


**Description:** qmd_search.py imports 're' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/qmd_search/scripts/qmd_search.py`

---

#### Skill 'qmd_search' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/qmd_search/scripts/qmd_search.py`


**Description:** qmd_search.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/qmd_search/scripts/qmd_search.py`

---

#### Skill 'qmd_search' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/qmd_search/scripts/qmd_search.py`


**Description:** qmd_search.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/qmd_search/scripts/qmd_search.py`

---

#### Skill 'qmd_search' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/qmd_search/scripts/qmd_search.py`


**Description:** qmd_search.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/qmd_search/scripts/qmd_search.py`

---

#### Skill 'ravens' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/ravens/scripts/ravens.py`


**Description:** ravens.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ravens/scripts/ravens.py`

---

#### Skill 'ravens' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/ravens/scripts/ravens.py`


**Description:** ravens.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ravens/scripts/ravens.py`

---

#### Skill 'ravens' imports external module 'os'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/ravens/scripts/ravens.py`


**Description:** ravens.py imports 'os' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ravens/scripts/ravens.py`

---

#### Skill 'ravens' imports external module 'time'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/ravens/scripts/ravens.py`


**Description:** ravens.py imports 'time' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ravens/scripts/ravens.py`

---

#### Skill 'ravens' imports external module 'uuid'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/ravens/scripts/ravens.py`


**Description:** ravens.py imports 'uuid' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ravens/scripts/ravens.py`

---

#### Skill 'ravens' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/ravens/scripts/ravens.py`


**Description:** ravens.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ravens/scripts/ravens.py`

---

#### Skill 'ravens' imports external module 'asyncio'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/ravens/scripts/ravens.py`


**Description:** ravens.py imports 'asyncio' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ravens/scripts/ravens.py`

---

#### Skill 'ravens' imports external module 'subprocess'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/ravens/scripts/ravens.py`


**Description:** ravens.py imports 'subprocess' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ravens/scripts/ravens.py`

---

#### Skill 'ravens' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/ravens/scripts/ravens.py`


**Description:** ravens.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ravens/scripts/ravens.py`

---

#### Skill 'ravens' imports external module 'typing'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/ravens/scripts/ravens.py`


**Description:** ravens.py imports 'typing' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ravens/scripts/ravens.py`

---

#### Skill 'ravens' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/ravens/scripts/ravens.py`


**Description:** ravens.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ravens/scripts/ravens.py`

---

#### Skill 'ravens' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/ravens/scripts/ravens.py`


**Description:** ravens.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ravens/scripts/ravens.py`

---

#### Skill 'ravens' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/ravens/scripts/ravens.py`


**Description:** ravens.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ravens/scripts/ravens.py`

---

#### Skill 'ravens' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/ravens/scripts/ravens.py`


**Description:** ravens.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ravens/scripts/ravens.py`

---

#### Skill 'bookmark-weaver' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/bookmark-weaver/scripts/weaver.py`


**Description:** weaver.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/bookmark-weaver/scripts/weaver.py`

---

#### Skill 'bookmark-weaver' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/bookmark-weaver/scripts/weaver.py`


**Description:** weaver.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/bookmark-weaver/scripts/weaver.py`

---

#### Skill 'bookmark-weaver' imports external module 'time'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/bookmark-weaver/scripts/weaver.py`


**Description:** weaver.py imports 'time' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/bookmark-weaver/scripts/weaver.py`

---

#### Skill 'bookmark-weaver' imports external module 'asyncio'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/bookmark-weaver/scripts/weaver.py`


**Description:** weaver.py imports 'asyncio' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/bookmark-weaver/scripts/weaver.py`

---

#### Skill 'bookmark-weaver' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/bookmark-weaver/scripts/weaver.py`


**Description:** weaver.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/bookmark-weaver/scripts/weaver.py`

---

#### Skill 'bookmark-weaver' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/bookmark-weaver/scripts/weaver.py`


**Description:** weaver.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/bookmark-weaver/scripts/weaver.py`

---

#### Skill 'bookmark-weaver' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/bookmark-weaver/scripts/weaver.py`


**Description:** weaver.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/bookmark-weaver/scripts/weaver.py`

---

#### Skill 'redactor' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/redactor/scripts/redactor.py`


**Description:** redactor.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/redactor/scripts/redactor.py`

---

#### Skill 'redactor' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/redactor/scripts/redactor.py`


**Description:** redactor.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/redactor/scripts/redactor.py`

---

#### Skill 'redactor' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/redactor/scripts/redactor.py`


**Description:** redactor.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/redactor/scripts/redactor.py`

---

#### Skill 'redactor' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/redactor/scripts/redactor.py`


**Description:** redactor.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/redactor/scripts/redactor.py`

---

#### Skill 'scan' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/scan/scripts/scan.py`


**Description:** scan.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/scan/scripts/scan.py`

---

#### Skill 'scan' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/scan/scripts/scan.py`


**Description:** scan.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/scan/scripts/scan.py`

---

#### Skill 'scan' imports external module 'subprocess'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/scan/scripts/scan.py`


**Description:** scan.py imports 'subprocess' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/scan/scripts/scan.py`

---

#### Skill 'scan' imports external module 'hashlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/scan/scripts/scan.py`


**Description:** scan.py imports 'hashlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/scan/scripts/scan.py`

---

#### Skill 'scan' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/scan/scripts/scan.py`


**Description:** scan.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/scan/scripts/scan.py`

---

#### Skill 'scan' imports external module 'sqlite3'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/scan/scripts/scan.py`


**Description:** scan.py imports 'sqlite3' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/scan/scripts/scan.py`

---

#### Skill 'scan' imports external module 'time'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/scan/scripts/scan.py`


**Description:** scan.py imports 'time' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/scan/scripts/scan.py`

---

#### Skill 'scan' imports external module 're'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/scan/scripts/scan.py`


**Description:** scan.py imports 're' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/scan/scripts/scan.py`

---

#### Skill 'scan' imports external module 'asyncio'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/scan/scripts/scan.py`


**Description:** scan.py imports 'asyncio' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/scan/scripts/scan.py`

---

#### Skill 'scan' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/scan/scripts/scan.py`


**Description:** scan.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/scan/scripts/scan.py`

---

#### Skill 'scan' imports external module 'typing'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/scan/scripts/scan.py`


**Description:** scan.py imports 'typing' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/scan/scripts/scan.py`

---

#### Skill 'chant' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/chant/scripts/chant.py`


**Description:** chant.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/chant/scripts/chant.py`

---

#### Skill 'norn' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/norn/scripts/norn.py`


**Description:** norn.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/norn/scripts/norn.py`

---

#### Skill 'norn' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/norn/scripts/norn.py`


**Description:** norn.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/norn/scripts/norn.py`

---

#### Skill 'norn' imports external module 'sqlite3'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/norn/scripts/norn.py`


**Description:** norn.py imports 'sqlite3' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/norn/scripts/norn.py`

---

#### Skill 'norn' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/norn/scripts/norn.py`


**Description:** norn.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/norn/scripts/norn.py`

---

#### Skill 'norn' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/norn/scripts/norn.py`


**Description:** norn.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/norn/scripts/norn.py`

---

#### Skill 'sprt' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/sprt/scripts/sprt.py`


**Description:** sprt.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/sprt/scripts/sprt.py`

---

#### Skill 'sprt' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/sprt/scripts/sprt.py`


**Description:** sprt.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/sprt/scripts/sprt.py`

---

#### Skill 'sprt' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/sprt/scripts/sprt.py`


**Description:** sprt.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/sprt/scripts/sprt.py`

---

#### Skill 'sprt' imports external module 'math'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/sprt/scripts/sprt.py`


**Description:** sprt.py imports 'math' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/sprt/scripts/sprt.py`

---

#### Skill 'sprt' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/sprt/scripts/sprt.py`


**Description:** sprt.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/sprt/scripts/sprt.py`

---

#### Skill 'sprt' imports external module 'tests'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/sprt/scripts/sprt.py`


**Description:** sprt.py imports 'tests' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/sprt/scripts/sprt.py`

---

#### Skill 'sprt' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/sprt/scripts/sprt.py`


**Description:** sprt.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/sprt/scripts/sprt.py`

---

#### Skill 'evolve' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/evolve/scripts/evolve.py`


**Description:** evolve.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/evolve/scripts/evolve.py`

---

#### Skill 'evolve' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/evolve/scripts/evolve.py`


**Description:** evolve.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/evolve/scripts/evolve.py`

---

#### Skill 'evolve' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/evolve/scripts/evolve.py`


**Description:** evolve.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/evolve/scripts/evolve.py`

---

#### Skill 'evolve' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/evolve/scripts/evolve.py`


**Description:** evolve.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/evolve/scripts/evolve.py`

---

#### Skill 'evolve' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/evolve/scripts/evolve.py`


**Description:** evolve.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/evolve/scripts/evolve.py`

---

#### Skill 'edda' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/edda/scripts/edda.py`


**Description:** edda.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/edda/scripts/edda.py`

---

#### Skill 'edda' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/edda/scripts/edda.py`


**Description:** edda.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/edda/scripts/edda.py`

---

#### Skill 'edda' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/edda/scripts/edda.py`


**Description:** edda.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/edda/scripts/edda.py`

---

#### Skill 'edda' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/edda/scripts/edda.py`


**Description:** edda.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/edda/scripts/edda.py`

---

#### Skill 'ritual' imports external module 'time'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/ritual/scripts/ritual.py`


**Description:** ritual.py imports 'time' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ritual/scripts/ritual.py`

---

#### Skill 'ritual' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/ritual/scripts/ritual.py`


**Description:** ritual.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ritual/scripts/ritual.py`

---

#### Skill 'ritual' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/ritual/scripts/ritual.py`


**Description:** ritual.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ritual/scripts/ritual.py`

---

#### Skill 'ritual' imports external module 'random'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/ritual/scripts/ritual.py`


**Description:** ritual.py imports 'random' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ritual/scripts/ritual.py`

---

#### Skill 'ritual' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/ritual/scripts/ritual.py`


**Description:** ritual.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ritual/scripts/ritual.py`

---

#### Skill 'ritual' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/ritual/scripts/ritual.py`


**Description:** ritual.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/ritual/scripts/ritual.py`

---

#### Skill 'locks' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/locks/scripts/locks.py`


**Description:** locks.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/locks/scripts/locks.py`

---

#### Skill 'locks' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/locks/scripts/locks.py`


**Description:** locks.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/locks/scripts/locks.py`

---

#### Skill 'locks' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/locks/scripts/locks.py`


**Description:** locks.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/locks/scripts/locks.py`

---

#### Skill 'locks' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/locks/scripts/locks.py`


**Description:** locks.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/locks/scripts/locks.py`

---

#### Skill 'annex' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/annex/scripts/annex.py`


**Description:** annex.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/annex/scripts/annex.py`

---

#### Skill 'annex' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/annex/scripts/annex.py`


**Description:** annex.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/annex/scripts/annex.py`

---

#### Skill 'annex' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/annex/scripts/annex.py`


**Description:** annex.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/annex/scripts/annex.py`

---

#### Skill 'annex' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/annex/scripts/annex.py`


**Description:** annex.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/annex/scripts/annex.py`

---

#### Skill 'style' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/style/scripts/style.py`


**Description:** style.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/style/scripts/style.py`

---

#### Skill 'style' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/style/scripts/style.py`


**Description:** style.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/style/scripts/style.py`

---

#### Skill 'style' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/style/scripts/style.py`


**Description:** style.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/style/scripts/style.py`

---

#### Skill 'style' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/style/scripts/style.py`


**Description:** style.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/style/scripts/style.py`

---

#### Skill 'style' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/style/scripts/style.py`


**Description:** style.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/style/scripts/style.py`

---

#### Skill 'scribe' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/scribe/scripts/memory.py`


**Description:** memory.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/scribe/scripts/memory.py`

---

#### Skill 'scribe' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/scribe/scripts/memory.py`


**Description:** memory.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/scribe/scripts/memory.py`

---

#### Skill 'scribe' imports external module 'os'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/scribe/scripts/memory.py`


**Description:** memory.py imports 'os' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/scribe/scripts/memory.py`

---

#### Skill 'scribe' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/scribe/scripts/memory.py`


**Description:** memory.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/scribe/scripts/memory.py`

---

#### Skill 'scribe' imports external module 'time'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/scribe/scripts/memory.py`


**Description:** memory.py imports 'time' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/scribe/scripts/memory.py`

---

#### Skill 'scribe' imports external module 'uuid'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/scribe/scripts/memory.py`


**Description:** memory.py imports 'uuid' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/scribe/scripts/memory.py`

---

#### Skill 'scribe' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/scribe/scripts/memory.py`


**Description:** memory.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/scribe/scripts/memory.py`

---

#### Skill 'scribe' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/scribe/scripts/memory.py`


**Description:** memory.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/scribe/scripts/memory.py`

---

#### Skill 'autobot' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/autobot/scripts/autobot.py`


**Description:** autobot.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/autobot/scripts/autobot.py`

---

#### Skill 'autobot' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/autobot/scripts/autobot.py`


**Description:** autobot.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/autobot/scripts/autobot.py`

---

#### Skill 'autobot' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/autobot/scripts/autobot.py`


**Description:** autobot.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/autobot/scripts/autobot.py`

---

#### Skill 'autobot' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/autobot/scripts/autobot.py`


**Description:** autobot.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/autobot/scripts/autobot.py`

---

#### Skill 'autobot' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/autobot/scripts/autobot.py`


**Description:** autobot.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/autobot/scripts/autobot.py`

---

#### Skill 'stability' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/stability/scripts/stability.py`


**Description:** stability.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/stability/scripts/stability.py`

---

#### Skill 'stability' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/stability/scripts/stability.py`


**Description:** stability.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/stability/scripts/stability.py`

---

#### Skill 'stability' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/stability/scripts/stability.py`


**Description:** stability.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/stability/scripts/stability.py`

---

#### Skill 'stability' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/stability/scripts/stability.py`


**Description:** stability.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/stability/scripts/stability.py`

---

#### Skill 'stability' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/stability/scripts/stability.py`


**Description:** stability.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/stability/scripts/stability.py`

---

#### Skill 'level-5-diagnostic' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/level-5-diagnostic/scripts/diagnostic.py`


**Description:** diagnostic.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/level-5-diagnostic/scripts/diagnostic.py`

---

#### Skill 'level-5-diagnostic' imports external module 'os'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/level-5-diagnostic/scripts/diagnostic.py`


**Description:** diagnostic.py imports 'os' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/level-5-diagnostic/scripts/diagnostic.py`

---

#### Skill 'level-5-diagnostic' imports external module 'time'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/level-5-diagnostic/scripts/diagnostic.py`


**Description:** diagnostic.py imports 'time' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/level-5-diagnostic/scripts/diagnostic.py`

---

#### Skill 'level-5-diagnostic' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/level-5-diagnostic/scripts/diagnostic.py`


**Description:** diagnostic.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/level-5-diagnostic/scripts/diagnostic.py`

---

#### Skill 'level-5-diagnostic' imports external module 're'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/level-5-diagnostic/scripts/diagnostic.py`


**Description:** diagnostic.py imports 're' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/level-5-diagnostic/scripts/diagnostic.py`

---

#### Skill 'level-5-diagnostic' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/level-5-diagnostic/scripts/diagnostic.py`


**Description:** diagnostic.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/level-5-diagnostic/scripts/diagnostic.py`

---

#### Skill 'level-5-diagnostic' imports external module 'collections'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/level-5-diagnostic/scripts/diagnostic.py`


**Description:** diagnostic.py imports 'collections' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/level-5-diagnostic/scripts/diagnostic.py`

---

#### Skill 'level-5-diagnostic' imports external module 'subprocess'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/level-5-diagnostic/scripts/diagnostic.py`


**Description:** diagnostic.py imports 'subprocess' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/level-5-diagnostic/scripts/diagnostic.py`

---

#### Skill 'level-5-diagnostic' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/level-5-diagnostic/scripts/diagnostic.py`


**Description:** diagnostic.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/level-5-diagnostic/scripts/diagnostic.py`

---

#### Skill 'level-5-diagnostic' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/level-5-diagnostic/scripts/vigilance_auditor.py`


**Description:** vigilance_auditor.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/level-5-diagnostic/scripts/vigilance_auditor.py`

---

#### Skill 'level-5-diagnostic' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/level-5-diagnostic/scripts/vigilance_auditor.py`


**Description:** vigilance_auditor.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/level-5-diagnostic/scripts/vigilance_auditor.py`

---

#### Skill 'level-5-diagnostic' imports external module 'time'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/level-5-diagnostic/scripts/vigilance_auditor.py`


**Description:** vigilance_auditor.py imports 'time' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/level-5-diagnostic/scripts/vigilance_auditor.py`

---

#### Skill 'level-5-diagnostic' imports external module 'uuid'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/level-5-diagnostic/scripts/vigilance_auditor.py`


**Description:** vigilance_auditor.py imports 'uuid' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/level-5-diagnostic/scripts/vigilance_auditor.py`

---

#### Skill 'level-5-diagnostic' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/level-5-diagnostic/scripts/vigilance_auditor.py`


**Description:** vigilance_auditor.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/level-5-diagnostic/scripts/vigilance_auditor.py`

---

#### Skill 'level-5-diagnostic' imports external module 'collections'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/level-5-diagnostic/scripts/vigilance_auditor.py`


**Description:** vigilance_auditor.py imports 'collections' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/level-5-diagnostic/scripts/vigilance_auditor.py`

---

#### Skill 'level-5-diagnostic' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/level-5-diagnostic/scripts/vigilance_auditor.py`


**Description:** vigilance_auditor.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/level-5-diagnostic/scripts/vigilance_auditor.py`

---

#### Skill 'level-5-diagnostic' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/level-5-diagnostic/scripts/vigilance_auditor.py`


**Description:** vigilance_auditor.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/level-5-diagnostic/scripts/vigilance_auditor.py`

---

#### Skill 'telemetry' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/telemetry/scripts/telemetry.py`


**Description:** telemetry.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/telemetry/scripts/telemetry.py`

---

#### Skill 'telemetry' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/telemetry/scripts/telemetry.py`


**Description:** telemetry.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/telemetry/scripts/telemetry.py`

---

#### Skill 'telemetry' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/telemetry/scripts/telemetry.py`


**Description:** telemetry.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/telemetry/scripts/telemetry.py`

---

#### Skill 'telemetry' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/telemetry/scripts/telemetry.py`


**Description:** telemetry.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/telemetry/scripts/telemetry.py`

---

#### Skill 'calculus' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/calculus/scripts/calculus.py`


**Description:** calculus.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/calculus/scripts/calculus.py`

---

#### Skill 'calculus' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/calculus/scripts/calculus.py`


**Description:** calculus.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/calculus/scripts/calculus.py`

---

#### Skill 'calculus' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/calculus/scripts/calculus.py`


**Description:** calculus.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/calculus/scripts/calculus.py`

---

#### Skill 'calculus' imports external module 'subprocess'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/calculus/scripts/calculus.py`


**Description:** calculus.py imports 'subprocess' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/calculus/scripts/calculus.py`

---

#### Skill 'calculus' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/calculus/scripts/calculus.py`


**Description:** calculus.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/calculus/scripts/calculus.py`

---

#### Skill 'one-mind' imports external module 'sqlite3'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/one-mind/scripts/fulfill.py`


**Description:** fulfill.py imports 'sqlite3' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/one-mind/scripts/fulfill.py`

---

#### Skill 'one-mind' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/one-mind/scripts/fulfill.py`


**Description:** fulfill.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/one-mind/scripts/fulfill.py`

---

#### Skill 'one-mind' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/one-mind/scripts/fulfill.py`


**Description:** fulfill.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/one-mind/scripts/fulfill.py`

---

#### Skill 'one-mind' imports external module 'os'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/one-mind/scripts/fulfill.py`


**Description:** fulfill.py imports 'os' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/one-mind/scripts/fulfill.py`

---

#### Skill 'one-mind' imports external module 'time'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/one-mind/scripts/fulfill.py`


**Description:** fulfill.py imports 'time' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/one-mind/scripts/fulfill.py`

---

#### Skill 'one-mind' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/one-mind/scripts/fulfill.py`


**Description:** fulfill.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/one-mind/scripts/fulfill.py`

---

#### Skill 'one-mind' imports external module 'sqlite3'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/one-mind/scripts/ingest.py`


**Description:** ingest.py imports 'sqlite3' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/one-mind/scripts/ingest.py`

---

#### Skill 'one-mind' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/one-mind/scripts/ingest.py`


**Description:** ingest.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/one-mind/scripts/ingest.py`

---

#### Skill 'one-mind' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/one-mind/scripts/ingest.py`


**Description:** ingest.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/one-mind/scripts/ingest.py`

---

#### Skill 'one-mind' imports external module 'hashlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/one-mind/scripts/ingest.py`


**Description:** ingest.py imports 'hashlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/one-mind/scripts/ingest.py`

---

#### Skill 'one-mind' imports external module 'time'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/one-mind/scripts/ingest.py`


**Description:** ingest.py imports 'time' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/one-mind/scripts/ingest.py`

---

#### Skill 'one-mind' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/one-mind/scripts/ingest.py`


**Description:** ingest.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/one-mind/scripts/ingest.py`

---

#### Skill 'trace' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/trace/scripts/trace.py`


**Description:** trace.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/trace/scripts/trace.py`

---

#### Skill 'trace' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/trace/scripts/trace.py`


**Description:** trace.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/trace/scripts/trace.py`

---

#### Skill 'trace' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/trace/scripts/trace.py`


**Description:** trace.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/trace/scripts/trace.py`

---

#### Skill 'trace' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/trace/scripts/trace.py`


**Description:** trace.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/trace/scripts/trace.py`

---

#### Skill 'matrix' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/matrix/scripts/matrix.py`


**Description:** matrix.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/matrix/scripts/matrix.py`

---

#### Skill 'matrix' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/matrix/scripts/matrix.py`


**Description:** matrix.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/matrix/scripts/matrix.py`

---

#### Skill 'matrix' imports external module 'subprocess'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/matrix/scripts/matrix.py`


**Description:** matrix.py imports 'subprocess' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/matrix/scripts/matrix.py`

---

#### Skill 'matrix' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/matrix/scripts/matrix.py`


**Description:** matrix.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/matrix/scripts/matrix.py`

---

#### Skill 'artifact-forge' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/artifact-forge/scripts/forge.py`


**Description:** forge.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/artifact-forge/scripts/forge.py`

---

#### Skill 'artifact-forge' imports external module 'asyncio'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/artifact-forge/scripts/forge.py`


**Description:** forge.py imports 'asyncio' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/artifact-forge/scripts/forge.py`

---

#### Skill 'artifact-forge' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/artifact-forge/scripts/forge.py`


**Description:** forge.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/artifact-forge/scripts/forge.py`

---

#### Skill 'artifact-forge' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/artifact-forge/scripts/forge.py`


**Description:** forge.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/artifact-forge/scripts/forge.py`

---

#### Skill 'artifact-forge' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/artifact-forge/scripts/forge.py`


**Description:** forge.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/artifact-forge/scripts/forge.py`

---

#### Skill 'artifact-forge' imports external module 'typing'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/artifact-forge/scripts/forge.py`


**Description:** forge.py imports 'typing' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/artifact-forge/scripts/forge.py`

---

#### Skill 'artifact-forge' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/artifact-forge/scripts/forge.py`


**Description:** forge.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/artifact-forge/scripts/forge.py`

---

#### Skill 'artifact-forge' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/artifact-forge/scripts/forge.py`


**Description:** forge.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/artifact-forge/scripts/forge.py`

---

#### Skill 'artifact-forge' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/artifact-forge/scripts/forge.py`


**Description:** forge.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/artifact-forge/scripts/forge.py`

---

#### Skill 'taliesin-optimizer' imports external module 'asyncio'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin-optimizer/scripts/manuscript_optimizer.py`


**Description:** manuscript_optimizer.py imports 'asyncio' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin-optimizer/scripts/manuscript_optimizer.py`

---

#### Skill 'taliesin-optimizer' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin-optimizer/scripts/manuscript_optimizer.py`


**Description:** manuscript_optimizer.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin-optimizer/scripts/manuscript_optimizer.py`

---

#### Skill 'taliesin-optimizer' imports external module 're'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin-optimizer/scripts/manuscript_optimizer.py`


**Description:** manuscript_optimizer.py imports 're' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin-optimizer/scripts/manuscript_optimizer.py`

---

#### Skill 'taliesin-optimizer' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin-optimizer/scripts/manuscript_optimizer.py`


**Description:** manuscript_optimizer.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin-optimizer/scripts/manuscript_optimizer.py`

---

#### Skill 'taliesin-optimizer' imports external module 'time'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin-optimizer/scripts/manuscript_optimizer.py`


**Description:** manuscript_optimizer.py imports 'time' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin-optimizer/scripts/manuscript_optimizer.py`

---

#### Skill 'taliesin-optimizer' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin-optimizer/scripts/manuscript_optimizer.py`


**Description:** manuscript_optimizer.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin-optimizer/scripts/manuscript_optimizer.py`

---

#### Skill 'taliesin-optimizer' imports external module 'typing'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin-optimizer/scripts/manuscript_optimizer.py`


**Description:** manuscript_optimizer.py imports 'typing' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin-optimizer/scripts/manuscript_optimizer.py`

---

#### Skill 'taliesin-optimizer' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin-optimizer/scripts/manuscript_optimizer.py`


**Description:** manuscript_optimizer.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin-optimizer/scripts/manuscript_optimizer.py`

---

#### Skill 'taliesin-optimizer' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin-optimizer/scripts/manuscript_optimizer.py`


**Description:** manuscript_optimizer.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin-optimizer/scripts/manuscript_optimizer.py`

---

#### Skill 'taliesin-optimizer' imports external module 'asyncio'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin-optimizer/scripts/taliesin_optimizer.py`


**Description:** taliesin_optimizer.py imports 'asyncio' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin-optimizer/scripts/taliesin_optimizer.py`

---

#### Skill 'taliesin-optimizer' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin-optimizer/scripts/taliesin_optimizer.py`


**Description:** taliesin_optimizer.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin-optimizer/scripts/taliesin_optimizer.py`

---

#### Skill 'taliesin-optimizer' imports external module 're'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin-optimizer/scripts/taliesin_optimizer.py`


**Description:** taliesin_optimizer.py imports 're' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin-optimizer/scripts/taliesin_optimizer.py`

---

#### Skill 'taliesin-optimizer' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin-optimizer/scripts/taliesin_optimizer.py`


**Description:** taliesin_optimizer.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin-optimizer/scripts/taliesin_optimizer.py`

---

#### Skill 'taliesin-optimizer' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin-optimizer/scripts/taliesin_optimizer.py`


**Description:** taliesin_optimizer.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin-optimizer/scripts/taliesin_optimizer.py`

---

#### Skill 'taliesin-optimizer' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/taliesin-optimizer/scripts/taliesin_optimizer.py`


**Description:** taliesin_optimizer.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/taliesin-optimizer/scripts/taliesin_optimizer.py`

---

#### Skill 'sterling' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/sterling/scripts/sterling.py`


**Description:** sterling.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/sterling/scripts/sterling.py`

---

#### Skill 'sterling' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/sterling/scripts/sterling.py`


**Description:** sterling.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/sterling/scripts/sterling.py`

---

#### Skill 'sterling' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/sterling/scripts/sterling.py`


**Description:** sterling.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/sterling/scripts/sterling.py`

---

#### Skill 'sterling' imports external module 'subprocess'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/sterling/scripts/sterling.py`


**Description:** sterling.py imports 'subprocess' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/sterling/scripts/sterling.py`

---

#### Skill 'sterling' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/sterling/scripts/sterling.py`


**Description:** sterling.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/sterling/scripts/sterling.py`

---

#### Skill 'sterling' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/sterling/scripts/sterling.py`


**Description:** sterling.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/sterling/scripts/sterling.py`

---

#### Skill 'consciousness' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/consciousness/scripts/consciousness.py`


**Description:** consciousness.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/consciousness/scripts/consciousness.py`

---

#### Skill 'consciousness' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/consciousness/scripts/consciousness.py`


**Description:** consciousness.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/consciousness/scripts/consciousness.py`

---

#### Skill 'consciousness' imports external module 'os'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/consciousness/scripts/consciousness.py`


**Description:** consciousness.py imports 'os' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/consciousness/scripts/consciousness.py`

---

#### Skill 'consciousness' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/consciousness/scripts/consciousness.py`


**Description:** consciousness.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/consciousness/scripts/consciousness.py`

---

#### Skill 'report' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/report/scripts/report.py`


**Description:** report.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/report/scripts/report.py`

---

#### Skill 'report' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/report/scripts/report.py`


**Description:** report.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/report/scripts/report.py`

---

#### Skill 'report' imports external module 'subprocess'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/report/scripts/report.py`


**Description:** report.py imports 'subprocess' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/report/scripts/report.py`

---

#### Skill 'report' imports external module 'json'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/report/scripts/report.py`


**Description:** report.py imports 'json' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/report/scripts/report.py`

---

#### Skill 'report' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/report/scripts/report.py`


**Description:** report.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/report/scripts/report.py`

---

#### Skill 'report' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/report/scripts/report.py`


**Description:** report.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/report/scripts/report.py`

---

#### Skill 'report' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/report/scripts/report.py`


**Description:** report.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/report/scripts/report.py`

---

#### Skill 'empire' imports external module 'argparse'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/empire/scripts/empire.py`


**Description:** empire.py imports 'argparse' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/empire/scripts/empire.py`

---

#### Skill 'empire' imports external module 'sys'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/empire/scripts/empire.py`


**Description:** empire.py imports 'sys' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/empire/scripts/empire.py`

---

#### Skill 'empire' imports external module 'subprocess'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/empire/scripts/empire.py`


**Description:** empire.py imports 'subprocess' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/empire/scripts/empire.py`

---

#### Skill 'empire' imports external module 'pathlib'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/empire/scripts/empire.py`


**Description:** empire.py imports 'pathlib' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/empire/scripts/empire.py`

---

#### Skill 'empire' imports external module 'src'

**Probe:** `import_boundaries`  **Directory:** `.agents/skills/`  

**Component:** `.agents/skills/empire/scripts/empire.py`


**Description:** empire.py imports 'src' which is not a local skill module. This may cause runtime failures if the dependency is not guaranteed in the execution environment.

**File:** `/home/morderith/Corvus/CStar/.agents/skills/empire/scripts/empire.py`

---


## Karpathy Loop: 0/10 findings analyzed

## Health Metrics

### Hall SQLite

**Database:** `/home/morderith/Corvus/CStar/.stats/pennyone.db`  
**Journal mode:** `wal`  
**WAL size:** 0.0 MB  
**Freelist:** 0.05%  
**Total size:** 275.13 MB  
**Pages:** 70433  
### Bead Throughput

*Error collecting bead data: no such column: resolved_at*

### Gungnir Score Trend

*No Gungnir scoring data available.*


## Detailed Source Findings

### [CRITICAL] f01 — SQLite: No WAL, No busy_timeout, Connection Per Call

**Component:** `bead_ledger.py`  **Directory:** `src/`
**Effort:** ~2.0h

**Problem:** HallOfRecords.connect() uses plain sqlite3.connect() with no journal mode, no WAL, no busy_timeout. Every call creates a new connection. BEGIN IMMEDIATE in upsert operations serializes writes entirely — produces 'database is locked' errors under concurrent multi-agent load.

**Impact:** Correctness failure under concurrent load. Write operations will fail with locked errors as agent count scales. BEGIN IMMEDIATE is a pessimistic lock that blocks all concurrent writers.

**Proposed Work:**

  1. Enable WAL on first connect: PRAGMA journal_mode=WAL
  2. Set busy_timeout: PRAGMA busy_timeout=5000
  3. Consider BEGIN CONCURRENT for true optimistic concurrent writes
  4. Add PRAGMA synchronous=NORMAL for balanced safety/speed
  5. Connection-per-call pattern is fine for SQLite — pragmas are the fix

**Research Highlights:**

- *[GitHub - joedougherty/sqlite3_concurrent_writes_test_suite: Simultating concurrent writes to sqlite3 with multiprocessing and pytest · GitHub](https://github.com/joedougherty/sqlite3_concurrent_writes_test_suite)*  
  > Here are some reasons to give it a try, straight from the sqlite3 documentation: There are advantages and disadvantages to using WAL instead of a rollback journal. Advantages include: *WAL is signific

- *[SQLite WAL Mode: 10x Performance for Python Apps - DEV Community](https://dev.to/lumin-playstar/sqlite-wal-mode-10x-performance-for-python-apps-4ic)*  
  > March 10, 2026 -... Concurrent Reads and Writes: This is the biggest win.Readers can continue reading from the main database file (and applying relevant WAL changes) while writers are simultaneously a

- *[The Write Stuff: Concurrent Write Transactions in SQLite – Oldmoe's blog](https://oldmoe.blog/2024/07/08/the-write-stuff-concurrent-write-transactions-in-sqlite/)*  
  > July 8, 2024 -With our approach though we can do transaction grouping, thus we can distribute the cost of a single fsync call on many concurrent transactions. Resulting in much higher performance in h

- *[charles leifer | Going Fast with SQLite and Python](https://charlesleifer.com/blog/going-fast-with-sqlite-and-python/)*  
  > November 1, 2017 -The semantics of pysqlite can give ... of the global write lock and the bad behavior of pysqlite. The most general would be touse the write-ahead-logging (WAL) journal_mode option...

---

### [CRITICAL] f08 — No Automated Test Suite Visible

**Component:** `tests/`  **Directory:** `tests/`
**Effort:** ~4.0h

**Problem:** No tests/ directory, no pytest.ini, no CI configuration visible. bead_ledger.py has complex state machine logic (normalization, legacy supersession, duplicate detection) that will accumulate bugs without regression coverage. Several files show inconsistent type annotation styles.

**Impact:** Correctness risk. Any refactor or feature addition has no guard against regressions. The complexity of the bead state machine is particularly vulnerable to silent breakage.

**Proposed Work:**

  1. Write tests/test_bead_ledger.py covering:
     - upsert_bead with duplicate detection
     - claim_bead / claim_next_bead / claim_next_p1_scan_bead transitions
     - normalize_existing_beads legacy supersession logic
     - resolve_bead / mark_ready_for_review / block_bead transitions
     - sync_tasks_projection
  2. Add ruff or pylint lint step
  3. Set up GitHub Actions (free, 10 min to configure)

**Research Highlights:**

- *[PythonPytestArchitecture: Fixtures, Mocking & PropertyTesting...](https://dev.to/kaushikcoderpy/python-pytest-architecture-fixtures-mocking-property-testing-2026-4k4e)*  
  > TheTestingTaxonomy: Strategies of anArchitectThePythonEcosystem: Choosing Your FrameworkPytestDeep Dive: Fixtures & Dependency Injection

- *[PytestTutorial - UnitTestinginPythonusingPytest... - GeeksforGeeks](https://www.geeksforgeeks.org/python/pytest-tutorial-testing-python-application-using-pytest/)*  
  > Pytestsearches fortestfiles that start withtest_ or end with _test.py. A function reverse_text() is created to take a string input and return its reversed value. Another functiontest_reverse_test()tes

- *[PythonPytestArchitecture: Fixtures, Mocking & PropertyTesting...](https://mytecharm.com.co/post/python-pytest-architecture-fixtures-mocking-property-testing-2026-d41n3o)*  
  > Pythontestingis the process of verifying that a program produces correct results, behaves as expected, and remains stable as changes are made. It is the onlypracticethat ensures long-term maintainabil

- *[TestingInPythonWithPytest- ExpertBeacon](https://expertbeacon.com/testing-in-python-with-pytest/)*  
  > BestPracticesforTestinginPython. Here are some additionalbestpracticesto structure effectivetestsuites withpytest: conftest.py.

---

### [CRITICAL] f09 — MuninnHeart: Broken Import — TheWatcher Not Found

**Component:** `muninn_heart.py`  **Directory:** `src/`
**Effort:** ~0.5h

**Problem:** muninn_heart.py imports: 'from src.core.engine.ravens.stability import TheWatcher'. No src/core/engine/ravens/stability.py exists in the repository. This import would fail at runtime, preventing MuninnHeart from being instantiated.

**Impact:** Runtime import failure. MuninnHeart cannot be used until this is resolved — either by creating stability.py or fixing the import.

**Proposed Work:**

  1. Verify TheWatcher class exists in the codebase
  2. If it doesn't exist: create stub at src/core/engine/ravens/stability.py
  3. If it exists elsewhere: fix the import path

**Research Highlights:**

- *[AI Observability in Python: Monitoring LLMs and ... - Medium](https://medium.com/@pysquad/ai-observability-in-python-monitoring-llms-and-agents-in-production-f270c572a8d1)*  
  > Mar 18, 2026 ·In this article we explore how to implementAIobservabilityusing Python. We discuss architecturepatterns,monitoringframeworks, and practical techniques for tracking LLM pipelines and...

- *[Agentic Architecture Pattern: Watchdog - Three Point Formula](https://threepointformula.wordpress.com/2025/11/04/agentic-architecture-pattern-watchdog/)*  
  > Agentic ArchitecturePattern: Agentic ArchitecturePattern:WatchdogExplanation: The module imports necessary dependencies: - from typing import Dict, Any, List, Optional: Type hints for better code docu

- *[python-statemachine · PyPI](https://pypi.org/project/python-statemachine/)*  
  > Welcome topython-statemachine, an intuitive and powerfulstatemachinelibrary designed for a great developer experience. Define flatstatemachinesor full statecharts with compoundstates, parallel regions

- *[Monitor, troubleshoot, and improve AI agents with Datadog](https://www.datadoghq.com/blog/monitor-ai-agents/)*  
  > Learn about the challenges ofmonitoringAIagentsand how Datadog LLM Observability's newest visualization overcomes them.

---

### [HIGH] f02 — HallBeadRecord: Raw Dataclass with No Field Validation

**Component:** `hall_schema.py`  **Directory:** `src/`
**Effort:** ~2.0h

**Problem:** HallBeadRecord and HallRepositoryRecord are bare @dataclass with no field validators. Invalid types, out-of-range values, or None where NOT NULL applies only fail at the SQLite layer with cryptic errors. No __post_init__ validation exists.

**Impact:** Data integrity risk. Bad records can enter the ledger and cause hard-to-debug failures downstream. The validation surface is entirely implicit and dependent on SQLite constraints.

**Proposed Work:**

  1. Add __post_init__ validators to HallBeadRecord and HallRepositoryRecord
  2. Validate: bead_id is non-empty string, status in HallBeadStatus,
     timestamps are positive integers
  3. Consider attrs @attr.s with validators for better performance
  4. Or use pydantic for validation layer only, keep dataclass for storage

**Research Highlights:**

- *[Python dataclass, what's a pythonic way to validate initialization ...](https://stackoverflow.com/questions/60179799/python-dataclass-whats-a-pythonic-way-to-validate-initialization-arguments)*  
  > The author of the dataclasses module made a conscious decision to not implement validators that are present in similar third party projects likeattrs,pydantic, or marshmallow. And if your actual probl

- *[dataclasses vs Pydantic vs attrs: Python Data Model Guide](https://tildalice.io/python-dataclasses-pydantic-attrs/)*  
  > dataclasses vsPydanticvsattrs: real benchmarks,validationtradeoffs, and which to pick for production. Spoiler: speed isn't the deciding factor.

- *[Dataclasses - Pydantic](https://docs.pydantic.dev/1.10/usage/dataclasses/)*  
  > DatavalidationusingPythontype hints You can use all the standardpydanticfield types, and the resultingdataclasswill be identical to the one created by the standard librarydataclassdecorator. The under

- *[Measuring Performance Differences Between pydantic, dataclass, attrs](https://ryanlstevens.github.io/2023-12-04-performancePythonDataclasses/)*  
  > Intro and Takeaways I recently started investigating performance differences between the differentdataclasslibraries inPython:dataclass,attrs, andpydantic.This simple investigation quickly spiralled i

---

### [HIGH] f03 — Duplicate Detection: String-Only Rationale Comparison

**Component:** `bead_ledger.py / _find_active_duplicate`  **Directory:** `src/`
**Effort:** ~2.0h

**Problem:** _find_active_duplicate() uses raw string equality on rationale as primary duplicate key. Two beads with semantically identical intent but different wording are treated as non-duplicates. The composite key (target_path, target_ref, target_kind) is not weighted over rationale text.

**Impact:** False negatives: legitimate duplicates missed due to wording. False positives: same rationale text on different files incorrectly flagged as duplicates. Both degrade ledger quality.

**Proposed Work:**

  1. Normalize rationale for comparison: strip(), lower(), remove code backticks
  2. Weight composite identity key over rationale text
  3. If two OPEN beads target same file with same acceptance_criteria, they are duplicates regardless of rationale wording

**Research Highlights:**

- *[Next-Gen AIAlgorithmsforDetectingand ResolvingDuplicate...](http://kijyomita.com/archives/2022-09.html?next-gen-ai-algorithms-for-detecting-and-resolving-duplicate-content-in-website-promotion)*  
  > Algorithmssuch as Universal Sentence Encoder or Sentence-BERT computesemanticvectors fortextsnippets, measuring theirsimilaritybeyond mere keyword overlap. This method accurately identifies content th

- *[13 BestDuplicateCodeChecker Tools in 2026 - DEV Community](https://dev.to/rahulxsingh/13-best-duplicate-code-checker-tools-in-2026-1cnk)*  
  > Compare 13duplicatecodedetectiontools - from open-source clonedetectorslike PMD CPD and jscpd to full platforms like SonarQube and DeepSource.Type 4 -Semanticclones. Functionally equivalentcodeimpleme

- *[Duplicatedetectionintextdata - NILG.AI](https://nilg.ai/202210/duplicate-detection-text/)*  
  > Atextsimilarityalgorithmis expected to retrieve a very highsimilarityrate.DuplicateDetectioninTextUsing Machine Learning. One of the tools created had the objective of retrieving thesimilaritybetween 

- *[code-duplication-detector- AI Skill | MuleRun Skills Hub](https://mulerun.com/skillshub/@sovrium/sovrium~code-duplication-detector:20260121115548)*  
  > Detectsduplicatecodepatterns,similarfunctions, repeated logic, and copy-pastecodeacross the codebase. Identifies refactoring opportunities by findingcodethat violates DRY principle. Reportsduplication

---

### [HIGH] f05 — MuninnHeart: Placeholder Loop Logic, Real Cycle Not Implemented

**Component:** `muninn_heart.py`  **Directory:** `src/`

**Problem:** _run_behavioral_pulse() returns True after 0.1s sleep. The Hunt → Forge → Empire → SPRT → Memory cycle is stubbed out. MuninnPromotion, MuninnCrucible, MuninnMemory, TheWatcher are instantiated but their methods are never called in the loop. _wait_for_silence() just sleeps 1s — no git-status or filesystem-activity detection.

**Impact:** The ravens core loop does not execute its stated contract. MuninnHeart appears to run but no actual promotion, crucible testing, or memory persistence occurs. Would silently produce incomplete results in production.

**Proposed Work:**

  1. Implement actual Hunt→Forge→Empire→SPRT→Memory cycle
  2. _wait_for_silence() needs git-status and stat-based activity detection before taking flight
  3. The 6-hour endurance limit guard is good — keep it
  4. Recommend dedicated BEAD for full ravens cycle implementation

**Research Highlights:**

- *[YourAIAgentIs Running Blind Without a SecondLoop| Medium](https://medium.com/@Micheal-Lanham/your-ai-agent-is-running-blind-without-a-second-loop-856a1aebdb5f)*  
  > The Two-LoopArchitecture: Why every reliableagentneeds both a cognitionloop(perceive, reason, act,learn) and a meta-cognitionloop(monitor, evaluate, regulate) running in tandem.

- *[AIAgentsExplained: The Complete Developer’s Guide to Intelligent...](https://www.gocodeo.com/post/ai-agents-explained)*  
  > Autonomy:AIagentscan operate independently without continuous human oversight. This is typically achieved through self-executing logic or trained models embedded within theagent’sarchitecture.

- *[Overcoming the Hurdles: BuildingAutonomousAIAgentswith LLMs...](https://joub.co.za/overcoming-the-hurdles-building-autonomous-ai-agents-with-llms-and-reinforcement-learning/)*  
  > These advancedAIagentsleverage large language models as their cognitive foundation, combining them withreinforcementlearningto enable continuous improvement through experience. In practical applicatio

- *[Creating anAIAgent-Based System with LangGraph... - MarkTechPost](https://www.marktechpost.com/2025/02/04/creating-an-ai-agent-based-system-with-langgraph-putting-a-human-in-the-loop/)*  
  > CanReinforcementLearningLearnEverything?Andrej Karpathy released autoresearch, a minimalist Python tool designed to enableAIagentstoautonomouslyconduct machinelearningexperiments. The project is a str

---

### [HIGH] f06 — Cortex RAG: No Update Mechanism, Stale Knowledge Risk

**Component:** `cortex.py`  **Directory:** `src/`
**Effort:** ~2.0h

**Problem:** Cortex.__init__ calls _ingest() which rebuilds the entire vector index from scratch on every initialization. No refresh(), update_skill(), or invalidation mechanism. If a skill or workflow document changes, Cortex serves stale results until process restart. No guard on total corpus size — could exhaust memory on large projects.

**Impact:** Stale knowledge in RAG responses. Documents updated on disk are not reflected in search results until restart. No mechanism to refresh incrementally. Large corpora could cause OOM.

**Proposed Work:**

  1. Add update_skill(trigger, text) method that removes old chunk and adds new one
  2. Add refresh() with stat-based dirty checking — re-read only changed files
  3. Add total corpus size guard — warn or reject if total ingested > 50MB

**Research Highlights:**

- *[RAG Knowledge Base Management | Updates & Refresh](https://apxml.com/courses/optimizing-rag-for-production/chapter-7-rag-scalability-reliability-maintainability/rag-knowledge-base-updates)*  
  > A Retrieval-Augmented Generation (RAG) system's intelligence is fundamentally tethered to the freshness and accuracy of itsknowledgebase. As external environments evolve, new information is generated,

- *[How to Update RAG Knowledge Base Without Rebuilding Everything](https://particula.tech/blog/update-rag-knowledge-without-rebuilding)*  
  > The problem wasn't theirRAGarchitecture—it was theirupdatestrategy. They treated every change as a reason to rebuild the entireknowledgebasefrom scratch: re-chunking all documents, regenerating all em

- *[How to Build RAG Systems with Real-Time Data Updates](https://markaicode.com/build-rag-systems-real-time-data-updates/)*  
  > Real-timeRAGsystems solve this problem by continuously ingesting fresh data and updatingvectorembeddings on-demand. You'll learn to build streaming data pipelines, implement incrementalvectorupdates, 

- *[rag-agent/data/knowledge_base/vector_db/index_refresh_patterns.txt at ...](https://github.com/CS-135-hub/rag-agent/blob/main/data/knowledge_base/vector_db/index_refresh_patterns.txt)*  
  > Knowledgebaseschange over time, sovectorindexes needrefreshstrategies. Batch rebuilds are simple but may lag behind sourceupdates. Freshness indicators help users understand how recent the retrievedkn

---

### [HIGH] f10 — Bead Contracts: No Pre-Execution Security Audit

**Component:** `heimdall_shield.py + bead_ledger.py`  **Directory:** `src/`
**Effort:** ~2.0h

**Problem:** heimdall_shield handles command-level blocking (rm -rf /, git reset --hard, fork bombs) but does not audit bead contract content before execution. A bead's checker_shell, rationale, or acceptance_criteria could contain injected commands or secrets — the shield only fires after the command runs.

**Impact:** Post-hoc blocking is insufficient for bead contracts. A malicious or compromised bead could modify system state beyond its scoped target before heimdall catches it.

**Proposed Work:**

  1. Add bead contract auditor: before any checker_shell executes, validate against heimdall_shield patterns
  2. Add provenance tracking: record which LLM generated each bead
  3. Enforce HallBeadRecord.source_kind field — currently rarely populated
  4. Integrate with OWASP Agentic AI Top 10 threat categories

**Research Highlights:**

- *[Tackling Agentic AI security – EA Voices](https://eavoices.com/2025/12/01/tackling-agentic-ai-security/)*  
  > By Sandeep Singh Executive SummaryAgenticAIintroduces uniquesecuritychallenges beyond traditional GenAI and modelsecurity.

- *[Agentic AI – EA Voices](https://eavoices.com/category/agentic-ai/)*  
  > Categories ,AgenticAI,AIAgents ,AIAssistants , Articles , Artificial Intelligence , Assistants , business transformation , EA Articles , EA ...

- *[AI and Sports – Security vs. Privacy – EA Voices](https://eavoices.com/2024/10/17/ai-and-sports-security-vs-privacy/)*  
  > Link: https://www.architectureandgovernance.com/artificial-intelligence/ai-and-sports-security-vs-privacy/ ... Leadership machine learningSecurity...

- *[AI Agents – EA Voices](https://eavoices.com/category/ai-agents/)*  
  > Categories ,AgenticAI,AIAgents ,AIAssistants , Articles , Artificial Intelligence , Assistants , business transformation , EA Articles , EA ...

---

### [MEDIUM] f07 — SovereignVector: Unbounded Cache Growth, No Eviction

**Component:** `vector.py`  **Directory:** `src/`
**Effort:** ~2.0h

**Problem:** _search_cache dict and shadow index are built in-memory with no eviction policy. Under heavy use both grow unboundedly. Shadow index is rebuilt in-memory on every build_index() call rather than persisted to disk.

**Impact:** Memory exhaustion over long runtime. Shadow index rebuild on every call is expensive. No cache efficiency signal for repeated queries.

**Proposed Work:**

  1. Add LRU eviction to _search_cache: maxsize=512 using functools.lru_cache or manual trim
  2. Persist shadow index to disk (pickle or sqlite) rather than rebuilding in-memory each call

**Research Highlights:**

- *[Caching in Python Using the LRU Cache Strategy – Real Python](https://realpython.com/lru-cache-python/)*  
  > June 23, 2023 -By default, maxsize is set to 128. If you set maxsize to None, then the cache will grow indefinitely, and no entries will be ever evicted. This could become a problem if you’re storing 

- *[cachetools — Extensible memoizing collections and decorators — cachetools 7.0.5 documentation](https://cachetools.readthedocs.io/en/stable/)*  
  > All these decorators wrap a function with a memoizing callable that saves up to the maxsize most recent calls, using different caching strategies.If maxsize is set to None, the caching strategy is eff

- *[GitHub - amitdev/lru-dict: A fast and memory efficient LRU cache for Python](https://github.com/amitdev/lru-dict)*  
  > A fixed size dict like container which evicts Least Recently Used (LRU) items once size limit is exceeded. There are many python implementations available which does similar things.

- *[Enterprise Python Troubleshooting: Diagnosing Memory Bloat and Performance Drift - Mindful Chase](https://www.mindfulchase.com/explore/troubleshooting-tips/programming-languages/enterprise-python-troubleshooting-diagnosing-memory-bloat-and-performance-drift.html)*  
  > August 12, 2025 -Use functools.lru_cache(maxsize=...) or an external cache like Redis for eviction-based strategies.

---

### [MEDIUM] f11 — Gungnir Scoring: Silent Fallback to 0.0 on Parse Failure

**Component:** `gungnir/schema.py / build_gungnir_matrix`  **Directory:** `src/`
**Effort:** ~1.0h

**Problem:** build_gungnir_matrix() falls back to 0.0 for any unparseable score value without logging or raising. A corrupted score in the database silently becomes 0.0 — not detectable unless the output is manually reviewed.

**Impact:** Silent data corruption. Corrupted scores appear as legitimate 0.0 results and could drive bad prioritization decisions.

**Proposed Work:**

  1. Add _validate_gungnir_matrix() that raises on unexpected field types
  2. Emit a warning log for any field that falls back to 0.0
  3. Return a structured result that distinguishes 0.0 (real) from None (unavailable)

**Research Highlights:**

- *[Introduction to Python’s logging library | Remove Complexity](https://rmcomplexity.com/article/2020/12/01/introduction-to-python-logging.html)*  
  > ...WARNINGand above levels and will ...BestPracticeCreateloggerswith custom names using __name__ to avoid collision and for granular configuration.

- *[Python logging - logging in Python with logging module](https://zetcode.com/python/logging/)*  
  > Events that should be logged include inputvalidationfailures ... The rootloggeralways has an explicit level set, which isWARNINGby default.

- *[Python and Logging - Python Lore](https://www.pythonlore.com/python-and-logging/)*  
  > ... we’ll look at somebestpracticesto keep your logs ... Anotherbestpracticeis to ensure that yourloggingconfiguration is easily adjustable.

- *[Comprehensive Guide to Python Logging (2024-2025) - codemaster](https://codemastertechnology.com/comprehensive-guide-to-python-logging-2024-2025/)*  
  > This guide delves deep intoPythonlogging, explaining its concepts, usage,bestpractices, and advanced techniques, with an emphasis on the latest ...

---

## Top Priorities for Today

1. **SQLite: No WAL, No busy_timeout, Connection Per Call** — `bead_ledger.py` (~2.0h)

2. **No Automated Test Suite Visible** — `tests/` (~4.0h)

3. **MuninnHeart: Broken Import — TheWatcher Not Found** — `muninn_heart.py` (~0.5h)

4. **Direct Engine bypass: 'KeepOS' imported in source file** — `cross_spoke_coupling` probe, `tests`

## Proposed BEADs

| ID | Title | Priority | Directory | Effort |
|----|-------|----------|-----------|--------|
| `f01` | SQLite: No WAL, No busy_timeout, Connection Per Call | P1 | src/ | 2.0h |
| `f02` | HallBeadRecord: Raw Dataclass with No Field Validation | P2 | src/ | 2.0h |
| `f03` | Duplicate Detection: String-Only Rationale Comparison | P2 | src/ | 2.0h |
| `f05` | MuninnHeart: Placeholder Loop Logic, Real Cycle Not Implemented | P2 | src/ | TBD |
| `f06` | Cortex RAG: No Update Mechanism, Stale Knowledge Risk | P2 | src/ | 2.0h |
| `f07` | SovereignVector: Unbounded Cache Growth, No Eviction | P3 | src/ | 2.0h |
| `f08` | No Automated Test Suite Visible | P1 | tests/ | 4.0h |
| `f09` | MuninnHeart: Broken Import — TheWatcher Not Found | P1 | src/ | 0.5h |
| `f10` | Bead Contracts: No Pre-Execution Security Audit | P2 | src/ | 2.0h |
| `f11` | Gungnir Scoring: Silent Fallback to 0.0 on Parse Failure | P3 | src/ | 1.0h |
| `PROBE_B__jailing__jailing.py` | Skill 'jailing' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__jailing__jailing.py` | Skill 'jailing' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__jailing__jailing.py` | Skill 'jailing' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__jailing__jailing.py` | Skill 'jailing' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__metrics__metrics.py` | Skill 'metrics' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__metrics__metrics.py` | Skill 'metrics' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__metrics__metrics.py` | Skill 'metrics' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__metrics__metrics.py` | Skill 'metrics' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__metrics__metrics.py` | Skill 'metrics' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__oracle__oracle.py` | Skill 'oracle' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__oracle__oracle.py` | Skill 'oracle' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__oracle__oracle.py` | Skill 'oracle' imports external module 'subprocess' | P3 | .agents/skills/ | TBD |
| `PROBE_B__oracle__oracle.py` | Skill 'oracle' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__oracle__oracle.py` | Skill 'oracle' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__oracle__oracle.py` | Skill 'oracle' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__research__research.py` | Skill 'research' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__research__research.py` | Skill 'research' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__research__research.py` | Skill 'research' imports external module 'os' | P3 | .agents/skills/ | TBD |
| `PROBE_B__research__research.py` | Skill 'research' imports external module 'subprocess' | P3 | .agents/skills/ | TBD |
| `PROBE_B__research__research.py` | Skill 'research' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__research__research.py` | Skill 'research' imports external module 'time' | P3 | .agents/skills/ | TBD |
| `PROBE_B__research__research.py` | Skill 'research' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__taliesin_main.py` | Skill 'taliesin' imports external module 'runpy' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__taliesin_main.py` | Skill 'taliesin' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__taliesin_main.py` | Skill 'taliesin' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__x_api.py` | Skill 'taliesin' imports external module 'os' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__x_api.py` | Skill 'taliesin' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__taliesin_spoke.py` | Skill 'taliesin' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__taliesin_spoke.py` | Skill 'taliesin' imports external module 'os' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__taliesin_spoke.py` | Skill 'taliesin' imports external module 're' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__taliesin_spoke.py` | Skill 'taliesin' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__taliesin_spoke.py` | Skill 'taliesin' imports external module 'time' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__taliesin_spoke.py` | Skill 'taliesin' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__taliesin_spoke.py` | Skill 'taliesin' imports external module 'typing' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__taliesin_spoke.py` | Skill 'taliesin' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__taliesin_spoke.py` | Skill 'taliesin' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__taliesin_spoke.py` | Skill 'taliesin' imports external module 'x_api' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__taliesin_forge.py` | Skill 'taliesin' imports external module 'runpy' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__taliesin_forge.py` | Skill 'taliesin' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__taliesin_forge.py` | Skill 'taliesin' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__recreate_chapter.py` | Skill 'taliesin' imports external module 'asyncio' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__recreate_chapter.py` | Skill 'taliesin' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__recreate_chapter.py` | Skill 'taliesin' imports external module 'os' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__recreate_chapter.py` | Skill 'taliesin' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__recreate_chapter.py` | Skill 'taliesin' imports external module 'typing' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__recreate_chapter.py` | Skill 'taliesin' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__recreate_chapter.py` | Skill 'taliesin' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin__recreate_chapter.py` | Skill 'taliesin' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__personas__personas.py` | Skill 'personas' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__personas__personas.py` | Skill 'personas' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__personas__personas.py` | Skill 'personas' imports external module 'subprocess' | P3 | .agents/skills/ | TBD |
| `PROBE_B__personas__personas.py` | Skill 'personas' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__personas__personas.py` | Skill 'personas' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__personas__personas.py` | Skill 'personas' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__chronicle__chronicle.py` | Skill 'chronicle' imports external module 'os' | P3 | .agents/skills/ | TBD |
| `PROBE_B__chronicle__chronicle.py` | Skill 'chronicle' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__chronicle__chronicle.py` | Skill 'chronicle' imports external module 're' | P3 | .agents/skills/ | TBD |
| `PROBE_B__chronicle__chronicle.py` | Skill 'chronicle' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__chronicle__chronicle.py` | Skill 'chronicle' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__chronicle__chronicle.py` | Skill 'chronicle' imports external module 'typing' | P3 | .agents/skills/ | TBD |
| `PROBE_B__promotion__promotion.py` | Skill 'promotion' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__promotion__promotion.py` | Skill 'promotion' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__promotion__promotion.py` | Skill 'promotion' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__promotion__promotion.py` | Skill 'promotion' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__linter__linter.py` | Skill 'linter' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__linter__linter.py` | Skill 'linter' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__linter__linter.py` | Skill 'linter' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__linter__linter.py` | Skill 'linter' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__linter__linter.py` | Skill 'linter' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__forge__forge.py` | Skill 'forge' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__forge__forge.py` | Skill 'forge' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__forge__forge.py` | Skill 'forge' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__forge__forge.py` | Skill 'forge' imports external module 'subprocess' | P3 | .agents/skills/ | TBD |
| `PROBE_B__forge__forge.py` | Skill 'forge' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__forge__forge.py` | Skill 'forge' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__forge__forge.py` | Skill 'forge' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__hunt__hunt.py` | Skill 'hunt' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__hunt__hunt.py` | Skill 'hunt' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__hunt__hunt.py` | Skill 'hunt' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__hunt__hunt.py` | Skill 'hunt' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__corvus-control__resolve_cstar.py` | Skill 'corvus-control' imports external module 'subprocess' | P3 | .agents/skills/ | TBD |
| `PROBE_B__corvus-control__resolve_cstar.py` | Skill 'corvus-control' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__corvus-control__resolve_cstar.py` | Skill 'corvus-control' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__corvus-control__resolve_cstar.py` | Skill 'corvus-control' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__daemon.py` | Skill '_archive' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__daemon.py` | Skill '_archive' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__network.py` | Skill '_archive' imports external module 'runpy' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__network.py` | Skill '_archive' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__network.py` | Skill '_archive' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__ravens.py` | Skill '_archive' imports external module 'subprocess' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__ravens.py` | Skill '_archive' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__ravens.py` | Skill '_archive' imports external module 'time' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__ravens.py` | Skill '_archive' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__ravens.py` | Skill '_archive' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__ravens.py` | Skill '_archive' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__unblock.py` | Skill '_archive' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__unblock.py` | Skill '_archive' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__unblock.py` | Skill '_archive' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__unblock.py` | Skill '_archive' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__synapse.py` | Skill '_archive' imports external module 'runpy' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__synapse.py` | Skill '_archive' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__synapse.py` | Skill '_archive' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive___template.py` | Skill '_archive' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive___template.py` | Skill '_archive' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive___template.py` | Skill '_archive' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__banana.py` | Skill '_archive' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__trace.py` | Skill '_archive' imports external module 'runpy' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__trace.py` | Skill '_archive' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__trace.py` | Skill '_archive' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__audit.py` | Skill '_archive' imports external module 'runpy' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__audit.py` | Skill '_archive' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__audit.py` | Skill '_archive' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__persona.py` | Skill '_archive' imports external module 'subprocess' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__persona.py` | Skill '_archive' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__persona.py` | Skill '_archive' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__huginn.py` | Skill '_archive' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__huginn.py` | Skill '_archive' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__heimdall.py` | Skill '_archive' imports external module 'runpy' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__heimdall.py` | Skill '_archive' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B___archive__heimdall.py` | Skill '_archive' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__warden__warden.py` | Skill 'warden' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__warden__warden.py` | Skill 'warden' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__warden__warden.py` | Skill 'warden' imports external module 'asyncio' | P3 | .agents/skills/ | TBD |
| `PROBE_B__warden__warden.py` | Skill 'warden' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__warden__warden.py` | Skill 'warden' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__warden__warden.py` | Skill 'warden' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__qmd_search__qmd_search.py` | Skill 'qmd_search' imports external module 'os' | P3 | .agents/skills/ | TBD |
| `PROBE_B__qmd_search__qmd_search.py` | Skill 'qmd_search' imports external module 're' | P3 | .agents/skills/ | TBD |
| `PROBE_B__qmd_search__qmd_search.py` | Skill 'qmd_search' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__qmd_search__qmd_search.py` | Skill 'qmd_search' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__qmd_search__qmd_search.py` | Skill 'qmd_search' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__ravens__ravens.py` | Skill 'ravens' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__ravens__ravens.py` | Skill 'ravens' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__ravens__ravens.py` | Skill 'ravens' imports external module 'os' | P3 | .agents/skills/ | TBD |
| `PROBE_B__ravens__ravens.py` | Skill 'ravens' imports external module 'time' | P3 | .agents/skills/ | TBD |
| `PROBE_B__ravens__ravens.py` | Skill 'ravens' imports external module 'uuid' | P3 | .agents/skills/ | TBD |
| `PROBE_B__ravens__ravens.py` | Skill 'ravens' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__ravens__ravens.py` | Skill 'ravens' imports external module 'asyncio' | P3 | .agents/skills/ | TBD |
| `PROBE_B__ravens__ravens.py` | Skill 'ravens' imports external module 'subprocess' | P3 | .agents/skills/ | TBD |
| `PROBE_B__ravens__ravens.py` | Skill 'ravens' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__ravens__ravens.py` | Skill 'ravens' imports external module 'typing' | P3 | .agents/skills/ | TBD |
| `PROBE_B__ravens__ravens.py` | Skill 'ravens' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__ravens__ravens.py` | Skill 'ravens' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__ravens__ravens.py` | Skill 'ravens' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__ravens__ravens.py` | Skill 'ravens' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__bookmark-weaver__weaver.py` | Skill 'bookmark-weaver' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__bookmark-weaver__weaver.py` | Skill 'bookmark-weaver' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__bookmark-weaver__weaver.py` | Skill 'bookmark-weaver' imports external module 'time' | P3 | .agents/skills/ | TBD |
| `PROBE_B__bookmark-weaver__weaver.py` | Skill 'bookmark-weaver' imports external module 'asyncio' | P3 | .agents/skills/ | TBD |
| `PROBE_B__bookmark-weaver__weaver.py` | Skill 'bookmark-weaver' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__bookmark-weaver__weaver.py` | Skill 'bookmark-weaver' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__bookmark-weaver__weaver.py` | Skill 'bookmark-weaver' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__redactor__redactor.py` | Skill 'redactor' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__redactor__redactor.py` | Skill 'redactor' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__redactor__redactor.py` | Skill 'redactor' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__redactor__redactor.py` | Skill 'redactor' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__scan__scan.py` | Skill 'scan' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__scan__scan.py` | Skill 'scan' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__scan__scan.py` | Skill 'scan' imports external module 'subprocess' | P3 | .agents/skills/ | TBD |
| `PROBE_B__scan__scan.py` | Skill 'scan' imports external module 'hashlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__scan__scan.py` | Skill 'scan' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__scan__scan.py` | Skill 'scan' imports external module 'sqlite3' | P3 | .agents/skills/ | TBD |
| `PROBE_B__scan__scan.py` | Skill 'scan' imports external module 'time' | P3 | .agents/skills/ | TBD |
| `PROBE_B__scan__scan.py` | Skill 'scan' imports external module 're' | P3 | .agents/skills/ | TBD |
| `PROBE_B__scan__scan.py` | Skill 'scan' imports external module 'asyncio' | P3 | .agents/skills/ | TBD |
| `PROBE_B__scan__scan.py` | Skill 'scan' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__scan__scan.py` | Skill 'scan' imports external module 'typing' | P3 | .agents/skills/ | TBD |
| `PROBE_B__chant__chant.py` | Skill 'chant' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__norn__norn.py` | Skill 'norn' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__norn__norn.py` | Skill 'norn' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__norn__norn.py` | Skill 'norn' imports external module 'sqlite3' | P3 | .agents/skills/ | TBD |
| `PROBE_B__norn__norn.py` | Skill 'norn' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__norn__norn.py` | Skill 'norn' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__sprt__sprt.py` | Skill 'sprt' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__sprt__sprt.py` | Skill 'sprt' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__sprt__sprt.py` | Skill 'sprt' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__sprt__sprt.py` | Skill 'sprt' imports external module 'math' | P3 | .agents/skills/ | TBD |
| `PROBE_B__sprt__sprt.py` | Skill 'sprt' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__sprt__sprt.py` | Skill 'sprt' imports external module 'tests' | P3 | .agents/skills/ | TBD |
| `PROBE_B__sprt__sprt.py` | Skill 'sprt' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__evolve__evolve.py` | Skill 'evolve' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__evolve__evolve.py` | Skill 'evolve' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__evolve__evolve.py` | Skill 'evolve' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__evolve__evolve.py` | Skill 'evolve' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__evolve__evolve.py` | Skill 'evolve' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__edda__edda.py` | Skill 'edda' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__edda__edda.py` | Skill 'edda' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__edda__edda.py` | Skill 'edda' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__edda__edda.py` | Skill 'edda' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__ritual__ritual.py` | Skill 'ritual' imports external module 'time' | P3 | .agents/skills/ | TBD |
| `PROBE_B__ritual__ritual.py` | Skill 'ritual' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__ritual__ritual.py` | Skill 'ritual' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__ritual__ritual.py` | Skill 'ritual' imports external module 'random' | P3 | .agents/skills/ | TBD |
| `PROBE_B__ritual__ritual.py` | Skill 'ritual' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__ritual__ritual.py` | Skill 'ritual' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__locks__locks.py` | Skill 'locks' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__locks__locks.py` | Skill 'locks' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__locks__locks.py` | Skill 'locks' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__locks__locks.py` | Skill 'locks' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__annex__annex.py` | Skill 'annex' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__annex__annex.py` | Skill 'annex' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__annex__annex.py` | Skill 'annex' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__annex__annex.py` | Skill 'annex' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__style__style.py` | Skill 'style' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__style__style.py` | Skill 'style' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__style__style.py` | Skill 'style' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__style__style.py` | Skill 'style' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__style__style.py` | Skill 'style' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__scribe__memory.py` | Skill 'scribe' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__scribe__memory.py` | Skill 'scribe' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__scribe__memory.py` | Skill 'scribe' imports external module 'os' | P3 | .agents/skills/ | TBD |
| `PROBE_B__scribe__memory.py` | Skill 'scribe' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__scribe__memory.py` | Skill 'scribe' imports external module 'time' | P3 | .agents/skills/ | TBD |
| `PROBE_B__scribe__memory.py` | Skill 'scribe' imports external module 'uuid' | P3 | .agents/skills/ | TBD |
| `PROBE_B__scribe__memory.py` | Skill 'scribe' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__scribe__memory.py` | Skill 'scribe' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__autobot__autobot.py` | Skill 'autobot' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__autobot__autobot.py` | Skill 'autobot' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__autobot__autobot.py` | Skill 'autobot' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__autobot__autobot.py` | Skill 'autobot' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__autobot__autobot.py` | Skill 'autobot' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__stability__stability.py` | Skill 'stability' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__stability__stability.py` | Skill 'stability' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__stability__stability.py` | Skill 'stability' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__stability__stability.py` | Skill 'stability' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__stability__stability.py` | Skill 'stability' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__level-5-diagnostic__diagnostic.py` | Skill 'level-5-diagnostic' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__level-5-diagnostic__diagnostic.py` | Skill 'level-5-diagnostic' imports external module 'os' | P3 | .agents/skills/ | TBD |
| `PROBE_B__level-5-diagnostic__diagnostic.py` | Skill 'level-5-diagnostic' imports external module 'time' | P3 | .agents/skills/ | TBD |
| `PROBE_B__level-5-diagnostic__diagnostic.py` | Skill 'level-5-diagnostic' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__level-5-diagnostic__diagnostic.py` | Skill 'level-5-diagnostic' imports external module 're' | P3 | .agents/skills/ | TBD |
| `PROBE_B__level-5-diagnostic__diagnostic.py` | Skill 'level-5-diagnostic' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__level-5-diagnostic__diagnostic.py` | Skill 'level-5-diagnostic' imports external module 'collections' | P3 | .agents/skills/ | TBD |
| `PROBE_B__level-5-diagnostic__diagnostic.py` | Skill 'level-5-diagnostic' imports external module 'subprocess' | P3 | .agents/skills/ | TBD |
| `PROBE_B__level-5-diagnostic__diagnostic.py` | Skill 'level-5-diagnostic' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__level-5-diagnostic__vigilance_auditor.py` | Skill 'level-5-diagnostic' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__level-5-diagnostic__vigilance_auditor.py` | Skill 'level-5-diagnostic' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__level-5-diagnostic__vigilance_auditor.py` | Skill 'level-5-diagnostic' imports external module 'time' | P3 | .agents/skills/ | TBD |
| `PROBE_B__level-5-diagnostic__vigilance_auditor.py` | Skill 'level-5-diagnostic' imports external module 'uuid' | P3 | .agents/skills/ | TBD |
| `PROBE_B__level-5-diagnostic__vigilance_auditor.py` | Skill 'level-5-diagnostic' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__level-5-diagnostic__vigilance_auditor.py` | Skill 'level-5-diagnostic' imports external module 'collections' | P3 | .agents/skills/ | TBD |
| `PROBE_B__level-5-diagnostic__vigilance_auditor.py` | Skill 'level-5-diagnostic' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__level-5-diagnostic__vigilance_auditor.py` | Skill 'level-5-diagnostic' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__telemetry__telemetry.py` | Skill 'telemetry' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__telemetry__telemetry.py` | Skill 'telemetry' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__telemetry__telemetry.py` | Skill 'telemetry' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__telemetry__telemetry.py` | Skill 'telemetry' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__calculus__calculus.py` | Skill 'calculus' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__calculus__calculus.py` | Skill 'calculus' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__calculus__calculus.py` | Skill 'calculus' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__calculus__calculus.py` | Skill 'calculus' imports external module 'subprocess' | P3 | .agents/skills/ | TBD |
| `PROBE_B__calculus__calculus.py` | Skill 'calculus' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__one-mind__fulfill.py` | Skill 'one-mind' imports external module 'sqlite3' | P3 | .agents/skills/ | TBD |
| `PROBE_B__one-mind__fulfill.py` | Skill 'one-mind' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__one-mind__fulfill.py` | Skill 'one-mind' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__one-mind__fulfill.py` | Skill 'one-mind' imports external module 'os' | P3 | .agents/skills/ | TBD |
| `PROBE_B__one-mind__fulfill.py` | Skill 'one-mind' imports external module 'time' | P3 | .agents/skills/ | TBD |
| `PROBE_B__one-mind__fulfill.py` | Skill 'one-mind' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__one-mind__ingest.py` | Skill 'one-mind' imports external module 'sqlite3' | P3 | .agents/skills/ | TBD |
| `PROBE_B__one-mind__ingest.py` | Skill 'one-mind' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__one-mind__ingest.py` | Skill 'one-mind' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__one-mind__ingest.py` | Skill 'one-mind' imports external module 'hashlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__one-mind__ingest.py` | Skill 'one-mind' imports external module 'time' | P3 | .agents/skills/ | TBD |
| `PROBE_B__one-mind__ingest.py` | Skill 'one-mind' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__trace__trace.py` | Skill 'trace' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__trace__trace.py` | Skill 'trace' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__trace__trace.py` | Skill 'trace' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__trace__trace.py` | Skill 'trace' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__matrix__matrix.py` | Skill 'matrix' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__matrix__matrix.py` | Skill 'matrix' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__matrix__matrix.py` | Skill 'matrix' imports external module 'subprocess' | P3 | .agents/skills/ | TBD |
| `PROBE_B__matrix__matrix.py` | Skill 'matrix' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__artifact-forge__forge.py` | Skill 'artifact-forge' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__artifact-forge__forge.py` | Skill 'artifact-forge' imports external module 'asyncio' | P3 | .agents/skills/ | TBD |
| `PROBE_B__artifact-forge__forge.py` | Skill 'artifact-forge' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__artifact-forge__forge.py` | Skill 'artifact-forge' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__artifact-forge__forge.py` | Skill 'artifact-forge' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__artifact-forge__forge.py` | Skill 'artifact-forge' imports external module 'typing' | P3 | .agents/skills/ | TBD |
| `PROBE_B__artifact-forge__forge.py` | Skill 'artifact-forge' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__artifact-forge__forge.py` | Skill 'artifact-forge' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__artifact-forge__forge.py` | Skill 'artifact-forge' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin-optimizer__manuscript_optimizer.py` | Skill 'taliesin-optimizer' imports external module 'asyncio' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin-optimizer__manuscript_optimizer.py` | Skill 'taliesin-optimizer' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin-optimizer__manuscript_optimizer.py` | Skill 'taliesin-optimizer' imports external module 're' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin-optimizer__manuscript_optimizer.py` | Skill 'taliesin-optimizer' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin-optimizer__manuscript_optimizer.py` | Skill 'taliesin-optimizer' imports external module 'time' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin-optimizer__manuscript_optimizer.py` | Skill 'taliesin-optimizer' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin-optimizer__manuscript_optimizer.py` | Skill 'taliesin-optimizer' imports external module 'typing' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin-optimizer__manuscript_optimizer.py` | Skill 'taliesin-optimizer' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin-optimizer__manuscript_optimizer.py` | Skill 'taliesin-optimizer' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin-optimizer__taliesin_optimizer.py` | Skill 'taliesin-optimizer' imports external module 'asyncio' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin-optimizer__taliesin_optimizer.py` | Skill 'taliesin-optimizer' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin-optimizer__taliesin_optimizer.py` | Skill 'taliesin-optimizer' imports external module 're' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin-optimizer__taliesin_optimizer.py` | Skill 'taliesin-optimizer' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin-optimizer__taliesin_optimizer.py` | Skill 'taliesin-optimizer' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__taliesin-optimizer__taliesin_optimizer.py` | Skill 'taliesin-optimizer' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__sterling__sterling.py` | Skill 'sterling' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__sterling__sterling.py` | Skill 'sterling' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__sterling__sterling.py` | Skill 'sterling' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__sterling__sterling.py` | Skill 'sterling' imports external module 'subprocess' | P3 | .agents/skills/ | TBD |
| `PROBE_B__sterling__sterling.py` | Skill 'sterling' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__sterling__sterling.py` | Skill 'sterling' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__consciousness__consciousness.py` | Skill 'consciousness' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__consciousness__consciousness.py` | Skill 'consciousness' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__consciousness__consciousness.py` | Skill 'consciousness' imports external module 'os' | P3 | .agents/skills/ | TBD |
| `PROBE_B__consciousness__consciousness.py` | Skill 'consciousness' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__report__report.py` | Skill 'report' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__report__report.py` | Skill 'report' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__report__report.py` | Skill 'report' imports external module 'subprocess' | P3 | .agents/skills/ | TBD |
| `PROBE_B__report__report.py` | Skill 'report' imports external module 'json' | P3 | .agents/skills/ | TBD |
| `PROBE_B__report__report.py` | Skill 'report' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__report__report.py` | Skill 'report' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__report__report.py` | Skill 'report' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_B__empire__empire.py` | Skill 'empire' imports external module 'argparse' | P3 | .agents/skills/ | TBD |
| `PROBE_B__empire__empire.py` | Skill 'empire' imports external module 'sys' | P3 | .agents/skills/ | TBD |
| `PROBE_B__empire__empire.py` | Skill 'empire' imports external module 'subprocess' | P3 | .agents/skills/ | TBD |
| `PROBE_B__empire__empire.py` | Skill 'empire' imports external module 'pathlib' | P3 | .agents/skills/ | TBD |
| `PROBE_B__empire__empire.py` | Skill 'empire' imports external module 'src' | P3 | .agents/skills/ | TBD |
| `PROBE_C__test_memory_partitioning.py` | Direct Engine bypass: 'KeepOS' imported in source file | P1 | tests | TBD |
| `PROBE_D__SKILL.md` | Registry bypass in SKILL.md | P2 | .agents/skills | TBD |
| `PROBE_D__diagnostic.py` | Registry bypass in diagnostic.py | P2 | .agents/skills | TBD |
| `PROBE_D__HANDOFF.md` | Registry bypass in HANDOFF.md | P2 | docs | TBD |
| `PROBE_D__HANDOFF.md` | Registry bypass in HANDOFF.md | P2 | docs | TBD |
| `PROBE_D__cstar_inspection_2026-04-07.md` | Registry bypass in cstar_inspection_2026-04-07.md | P2 | docs | TBD |
| `PROBE_D__cstar_inspection_2026-04-07.md` | Registry bypass in cstar_inspection_2026-04-07.md | P2 | docs | TBD |
| `PROBE_D__cstar_capability_discovery_api.md` | Registry bypass in cstar_capability_discovery_api.md | P2 | docs | TBD |
| `PROBE_D__cstar_capability_discovery_api.md` | Registry bypass in cstar_capability_discovery_api.md | P2 | docs | TBD |
| `PROBE_D__host_native_skill_contract.md` | Registry bypass in host_native_skill_contract.md | P2 | docs | TBD |
| `PROBE_D__host_native_skill_contract.md` | Registry bypass in host_native_skill_contract.md | P2 | docs | TBD |
| `PROBE_D__HOST_CONVERGENCE_BACKLOG.json` | Registry bypass in HOST_CONVERGENCE_BACKLOG.json | P2 | docs | TBD |
| `PROBE_D__HOST_CONVERGENCE_BACKLOG.json` | Registry bypass in HOST_CONVERGENCE_BACKLOG.json | P2 | docs | TBD |
| `PROBE_D__SKILL_REGISTRY.md` | Registry bypass in SKILL_REGISTRY.md | P2 | docs | TBD |
| `PROBE_D__SKILL_REGISTRY.md` | Registry bypass in SKILL_REGISTRY.md | P2 | docs | TBD |
| `PROBE_D__SKILL_PERMUTATIONS.md` | Registry bypass in SKILL_PERMUTATIONS.md | P2 | docs | TBD |
| `PROBE_D__HOST_CONVERGENCE_BACKLOG.qmd` | Registry bypass in HOST_CONVERGENCE_BACKLOG.qmd | P2 | docs | TBD |
| `PROBE_D__HOST_CONVERGENCE_BACKLOG.qmd` | Registry bypass in HOST_CONVERGENCE_BACKLOG.qmd | P2 | docs | TBD |
| `PROBE_D__PHASE_1_IMPLEMENTATION_BACKLOG.qmd` | Registry bypass in PHASE_1_IMPLEMENTATION_BACKLOG.qmd | P2 | docs | TBD |
| `PROBE_D__PHASE_1_IMPLEMENTATION_BACKLOG.qmd` | Registry bypass in PHASE_1_IMPLEMENTATION_BACKLOG.qmd | P2 | docs | TBD |
| `PROBE_D__test_release_bundles.test.ts` | Registry bypass in test_release_bundles.test.ts | P2 | tests | TBD |
| `PROBE_D__test_host_session_runtime.test.ts` | Registry bypass in test_host_session_runtime.test.ts | P2 | tests | TBD |
| `PROBE_D__test_distribution_manifests.test.ts` | Registry bypass in test_distribution_manifests.test.ts | P2 | tests | TBD |
| `PROBE_D__test_runtime_dispatch.test.ts` | Registry bypass in test_runtime_dispatch.test.ts | P2 | tests | TBD |
| `PROBE_D__test_runtime_command_invocations.test.ts` | Registry bypass in test_runtime_command_invocations.test.ts | P2 | tests | TBD |
| `PROBE_D__test_chant_runtime.test.ts` | Registry bypass in test_chant_runtime.test.ts | P2 | tests | TBD |
| `PROBE_D__test_release_archives.test.ts` | Registry bypass in test_release_archives.test.ts | P2 | tests | TBD |
| `PROBE_D__test_host_native_trace_lineage.test.ts` | Registry bypass in test_host_native_trace_lineage.test.ts | P2 | tests | TBD |
| `PROBE_D__test_chant_autobot_handoff.test.ts` | Registry bypass in test_chant_autobot_handoff.test.ts | P2 | tests | TBD |
| `PROBE_D__test_chant_stress_runtime.test.ts` | Registry bypass in test_chant_stress_runtime.test.ts | P2 | tests | TBD |
| `PROBE_D__test_agent_browser.test.ts` | Registry bypass in test_agent_browser.test.ts | P2 | tests | TBD |
| `PROBE_D__test_chant_host_native_dispatch.test.ts` | Registry bypass in test_chant_host_native_dispatch.test.ts | P2 | tests | TBD |
| `PROBE_D__test_chant_planning_runtime.test.ts` | Registry bypass in test_chant_planning_runtime.test.ts | P2 | tests | TBD |
| `PROBE_D__test_distribution_installers.test.ts` | Registry bypass in test_distribution_installers.test.ts | P2 | tests | TBD |
| `PROBE_D__test_dispatcher.test.ts` | Registry bypass in test_dispatcher.test.ts | P2 | tests | TBD |
| `PROBE_D__cstar_dispatcher.py` | Registry bypass in cstar_dispatcher.py | P2 | src | TBD |
| `PROBE_D__host_session.ts` | Registry bypass in host_session.ts | P2 | src | TBD |
| `PROBE_D__distributions.ts` | Registry bypass in distributions.ts | P2 | src | TBD |
| `PROBE_D__distributions.ts` | Registry bypass in distributions.ts | P2 | src | TBD |
| `PROBE_D__capability_discovery.ts` | Registry bypass in capability_discovery.ts | P2 | src | TBD |
| `PROBE_D__bootstrap.ts` | Registry bypass in bootstrap.ts | P2 | src | TBD |
| `PROBE_D__dispatcher.ts` | Registry bypass in dispatcher.ts | P2 | src | TBD |
| `PROBE_D__entry_surface.ts` | Registry bypass in entry_surface.ts | P2 | src | TBD |
| `PROBE_D__legacy_commands.ts` | Registry bypass in legacy_commands.ts | P2 | src | TBD |
| `PROBE_D__chant_parser.ts` | Registry bypass in chant_parser.ts | P2 | src | TBD |
| `PROBE_D__search.ts` | Registry bypass in search.ts | P2 | src | TBD |
| `PROBE_D__search.ts` | Registry bypass in search.ts | P2 | src | TBD |
| `PROBE_D__repository_manager.ts` | Registry bypass in repository_manager.ts | P2 | src | TBD |
| `PROBE_D__repository_manager.ts` | Registry bypass in repository_manager.ts | P2 | src | TBD |
| `PROBE_D__session_manager.ts` | Registry bypass in session_manager.ts | P2 | src | TBD |
| `PROBE_D__session_manager.ts` | Registry bypass in session_manager.ts | P2 | src | TBD |
| `PROBE_D__bead_controller.ts` | Registry bypass in bead_controller.ts | P2 | src | TBD |
| `PROBE_D__bead_controller.ts` | Registry bypass in bead_controller.ts | P2 | src | TBD |
| `PROBE_D__memory_db.py` | Registry bypass in memory_db.py | P2 | src | TBD |
| `PROBE_E____init__` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E____init__` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E____init__` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__install_skill` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__skill_forge` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__synapse_auth` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E____init__` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__synapse_sync` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E____init__` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__sentinel_perf` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__danger_room` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__benchmark_engine` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__user_feedback` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E____init__` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__network_watcher` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__list_models` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__lightning_rod` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__archive_consolidator` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__utility_belt` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__loop` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__compile_session_traces` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__compile_failure_report` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__generate_tests` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__perimeter_sweep` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__trace_viz` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__merge_traces` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__voice_check` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__tune_weights` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__debt_viz` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__wrap_it_up` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__update_gemini_manifest` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__gemini_search` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__latency_check` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__code_sentinel` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__migrate_to_qmd` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__brave_search` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__vault` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__security_scan` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__acquire` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__overwatch` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E____init__` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__annex` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__payload` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__vitals_spoke` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__redactor` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E____init__` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__metrics` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__promotion_registry` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__norn_coordinator` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__utils` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__cstar_dispatcher` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__one_mind_bridge` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__sovereign_hud` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__sv_engine` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__edda` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__host_session` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__runtime_env` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__synapse_db` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__mimir_client` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__telemetry` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__lease_manager` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__prompt_linter` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__kernel_bridge` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__bootstrap` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__set_persona` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__personas` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__sterling_auditor` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__report_engine` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__rpc` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E____init__` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__uplink` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__dormancy` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__hunter` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__visual_explainer` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__wild_hunt` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__cache_bro` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__analyze_workflow` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__learn` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__evolution_watch` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__main` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__ui` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__scenarios` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E____init__` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__models` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__rng` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__campaign_updater` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__logic` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__gm_client` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__persistence` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__adjudicator` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E____init__` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__diag_engine` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__quick_check` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__catalog_check` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__audit_dialogue` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__cjk_check` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__debug_engine` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__debug_fishtest_phase2` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__verify_fish` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__debug_perf` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__collision_investigator` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__debug_fishtest` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__check_pro` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__runecaster_audit` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__overfit_corrections` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E____init__` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__sanitize_thesaurus` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__expand_thesaurus` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__dedupe_corrections` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__atomic_gpt` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__cognitive_router` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__validation_result` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__skill_learning` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__memory_db` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__builder` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E____init__` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__dialogue` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__evolve_skill` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__instruction_loader` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__cortex` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__vector_shadow` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__ravens_stage` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__vector` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__autobot_skill` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__reporter` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__injector` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__heimdall_shield` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__vector_router` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__bead_ledger` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__context` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__hall_schema` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__forge_candidate` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__bifrost` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__vector_config` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__executor` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__vector_ingest` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__sovereign_worker` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__vector_calculus` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__orchestrator` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__env_adapter` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__ledger` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__schema` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__universal` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__sandbox_warden` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__stability` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__code_sanitizer` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__stability` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__ravens_runtime` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__repo_spoke` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__muninn_crucible` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__muninn` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__muninn_memory` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__score_cohesion` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__coordinator` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__git_spoke` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__muninn_promotion` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__muninn_hunter` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__ravens_cycle` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__muninn_heart` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__harvest_responses` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__scour` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E____init__` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__runecaster` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__freya` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__base` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__valkyrie` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__edda` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__taste` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__mimir` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__security` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__shadow_forge` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__norn` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__huginn` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__ghost_warden` | Modified file missing Corvus Star Trace block | P2 | src/ | TBD |
| `PROBE_E__ouroboros` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__vector` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__jailing` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__metrics` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__oracle` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__research` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__taliesin_main` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__x_api` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__taliesin_spoke` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__taliesin_forge` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__recreate_chapter` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__personas` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__chronicle` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__promotion` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__linter` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__forge` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__hunt` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__resolve_cstar` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__daemon` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__network` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__ravens` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__unblock` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__synapse` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E___template` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__banana` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__trace` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__audit` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__persona` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__huginn` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__heimdall` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__warden` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__qmd_search` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__ravens` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__weaver` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__redactor` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__scan` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__chant` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__norn` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__sprt` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__evolve` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__edda` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__ritual` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__locks` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__annex` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__style` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__memory` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__autobot` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__stability` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__diagnostic` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__vigilance_auditor` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__telemetry` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__calculus` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__fulfill` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__ingest` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__trace` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__matrix` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__forge` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__manuscript_optimizer` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__taliesin_optimizer` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__sterling` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__consciousness` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__report` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__empire` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__compiler` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__symbolic_legend` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__factories` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__stabilizer` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |
| `PROBE_E__semantic_probe` | Modified file missing Corvus Star Trace block | P2 | .agents/ | TBD |