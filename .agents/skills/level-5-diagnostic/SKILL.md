---
name: level-5-diagnostic
description: "Use when executing a comprehensive, read-only diagnostic of the Corvus Star framework to identify structural weaknesses and generate actionable follow-up beads."
tier: SKILL
risk: safe
source: internal
---

# 🧿 LEVEL 5 DIAGNOSTIC

> **ROLE:** The Omni-Auditor
> **PURPOSE:** Executes a comprehensive, read-only diagnostic of the entire Corvus Star framework (The Estate). It categorizes and audits all subsystems, marks them for review, and generates an actionable implementation plan via new Beads.

## 1. Core Mandate
The Level 5 Diagnostic is the ultimate structural audit. It operates exactly like Geordi La Forge running a Level 5 Diagnostic on the Enterprise.
*   **Report-Only:** It does not mutate source, hooks, settings, manifests, or Hall state. It only writes diagnostic artifacts under the CStar root.
*   **Comprehensive:** It must cover every architectural pillar of CStar.
*   **Actionable:** It generates `LEVEL_5_DIAGNOSTIC_REPORT.md` and `LEVEL_5_DIAGNOSTIC_FINDINGS.json` representing an execution roadmap for any found anomalies. Bead creation is a separate reviewed step.
*   **Refactor-Aware:** It must fail loud on registry/runtime drift, host-native boundary regressions, direct provider bypasses, non-hermetic tests, and missing focused coverage for new refactor surfaces.

## 2. The Architectural Pillars (Parent Beads)
The skill organizes its audit across these seven main systems:
1.  **The Kernel Router:** `cstar.ts`, `src/node/core/runtime/`, and `src/core/cstar_dispatcher.py`
2.  **The Memory Plane:** `src/tools/pennyone/` and `src/core/engine/hall_schema.py`
3.  **The Estate & Spokes:** Multi-repo mounting logic in `src/core/engine/ravens/repo_spoke.py`.
4.  **The Enforcers (Wardens & Lore):** The Python scripts in `src/core/engine/wardens/`.
5.  **The Evolutionary Engine:** `weave:evolve`, Karpathy auto-researcher, and SPRT.
6.  **The Autonomous Pulse:** Muninn daemon logic in `src/core/engine/ravens/muninn.py`.
7.  **Runtime & Integrity Pulse:** Hook collisions (`settings.json`), Extension command paths (`os.toml`), host-native chant boundary drift, direct provider bypasses, and Swarm health.

## 3. Execution Flow
1.  The diagnostic script groups findings by architectural pillar.
2.  It identifies child-level targets for follow-up review.
3.  **Debug Check:** It performs read-only inspection of CLI hooks and extension manifests to identify path drift or redundant triggers.
4.  It performs static analysis (locating legacy keywords, checking file weight).
5.  It checks refactor integrity: stale `cstar chant` shell surfaces, direct AutoBot/Hermes subprocess calls, non-hermetic test gates, and missing focused coverage for newly introduced runtime surfaces.
6.  It compiles the final Markdown report.
7.  It does not print or invoke a shell `cstar chant` handoff. Follow-up bead work must be created through the active host-native workflow after review.

## 4. Guardrails
* `--resolve` is deprecated and must not mutate anything. It only emits a warning.
* The script root is the CStar repository root, not the Corvus estate root.
* Generated artifacts are limited to `LEVEL_5_DIAGNOSTIC_FINDINGS.json` and `LEVEL_5_DIAGNOSTIC_REPORT.md`.
* The diagnostic must not recommend `cstar chant` as a shell command; stale shell chant references are findings.
