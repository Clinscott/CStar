# 🧿 LEVEL 5 DIAGNOSTIC

> **ROLE:** The Omni-Auditor
> **PURPOSE:** Executes a comprehensive, read-only diagnostic of the entire Corvus Star framework (The Estate). It categorizes and audits all subsystems, marks them for review, and generates an actionable implementation plan via new Beads.

## 1. Core Mandate
The Level 5 Diagnostic is the ultimate structural audit. It operates exactly like Geordi La Forge running a Level 5 Diagnostic on the Enterprise.
*   **Read-Only:** It does not mutate files. It only analyzes structure, complexity, and dependencies.
*   **Comprehensive:** It must cover every architectural pillar of CStar.
*   **Actionable:** It generates a full `LEVEL_5_DIAGNOSTIC_REPORT.md` and populates `PennyOne` with new `OPEN` beads representing an execution roadmap for any found anomalies.

## 2. The Architectural Pillars (Parent Beads)
The skill organizes its audit across these six main systems:
1.  **The Kernel Router:** `cstar.ts`, `src/node/core/runtime/`, and `src/core/cstar_dispatcher.py`
2.  **The Memory Plane:** `src/tools/pennyone/` and `src/core/engine/hall_schema.py`
3.  **The Estate & Spokes:** Multi-repo mounting logic in `src/core/engine/ravens/repo_spoke.py`.
4.  **The Enforcers (Wardens & Lore):** The Python scripts in `src/core/engine/wardens/`.
5.  **The Evolutionary Engine:** `weave:evolve`, Karpathy auto-researcher, and SPRT.
6.  **The Autonomous Pulse:** Muninn daemon logic in `src/core/engine/ravens/muninn.py`.

## 3. Execution Flow
1.  The diagnostic script registers **Parent Beads** for each pillar.
2.  It dynamically spawns **Child Beads** to audit specific files under each pillar.
3.  It performs static analysis (locating legacy keywords, checking file weight).
4.  It compiles the final Markdown report.
5.  It inserts actionable, proposed Beads into the PennyOne database using the Chant weave methodology so the Shaman can take action later.
