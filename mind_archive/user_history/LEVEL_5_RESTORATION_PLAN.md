# 🧿 LEVEL 5 DIAGNOSTIC: RESTORATION PLAN

> **ROLE:** The One Mind (Overseer)
> **STATUS:** RESEARCH COMPLETE | ORCHESTRATION IN FLIGHT
> **OBJECTIVE:** Resolve the "Ship of Theseus" state of Corvus Star by decommissioning legacy daemons, closing Linscott test breaches, and decomposing overweight database controllers.

---

## 🏛️ ARCHITECTURAL ANALYSIS (STATE OF THE ESTATE)

The Level 5 Diagnostic sweep of **2,465 files** has revealed three critical areas of technical debt that threaten the stability of the V2 architecture:

1.  **The Sentinel Drift:** The `src/sentinel/` directory remains the home of robust but legacy autonomous logic (Muninn, Taliesin). While `.agents/skills/ravens` exists, it is currently an incomplete blueprint. The system is operating with "dual hearts"—one in the old daemon structure and one in the new skill structure.
2.  **The Vigilance Debt:** **76% of the estate** is in a Linscott Breach state. This is primarily concentrated in the General Subsystems and the newly forged Node.js Kernel entry points (`cstar.ts`).
3.  **The Memory Monolith:** The PennyOne SQLite controllers (`database.ts`, `hall_schema.py`) have grown into 2,000+ line monoliths, violating the Gungnir principles of structural beauty and logic modularity.

---

## 📋 CONSOLIDATED IMPLEMENTATION ROADMAP

I have successfully completed the **Legacy Decommissioning** phase:
1.  **[COMPLETED] `pb-legacy`**: Moved `src/sentinel/` daemons (Muninn, Taliesin) to `docs/legacy_archive/src_sentinel/`.
2.  **[COMPLETED] `ravens-skill`**: Ported industrial-grade autonomous logic into `.agents/skills/ravens/scripts/ravens.py`.
3.  **[COMPLETED] `core-engine-refactor`**: Relocated sentinel spokes and wardens to `src/core/engine/ravens/` and `src/core/engine/wardens/`.
4.  **[COMPLETED] `import-normalization`**: Surgically updated all Python and TypeScript imports across the estate.

### 1. Pillar: Kernel & Routing (`pb-kernel`)
*   **Target:** `cstar.ts`, `dispatcher.ts`
*   **Action:** Implement the `test_cstar_kernel.test.ts` suite (designed by Generalist) to ensure 1:1 isolation.
*   **Success Metric:** Linscott compliance for the routing layer.

### 2. Pillar: Legacy Decommissioning (`pb-legacy`)
*   **Target:** `src/sentinel/*.py` -> `.agents/skills/`
*   **Action:** 
    *   Port 6-hour endurance and rollback logic from `MuninnHeart` to `ravens.py`.
    *   Migrate `taliesin.py` logic to the `taliesin` skill boundary.
    *   Decommission `src/sentinel/` upon verified migration.
*   **Success Metric:** Zero daemon scripts in `src/sentinel/`.

### 3. Pillar: Memory Decomposition (`pb-memory`)
*   **Target:** `src/tools/pennyone/intel/database.ts`
*   **Action:** Research and execute the split into `bead_controller.ts`, `session_manager.ts`, and `intel_indexer.ts`.
*   **Success Metric:** File weights < 500 lines.

### 4. Pillar: The Vigilance Sweep (`pb-gen-subsys`)
*   **Target:** 1,892 files in Linscott Breach.
*   **Action:** Sequential execution of research beads to categorize files as **FUNCTIONAL** (needs test) or **LEGACY** (needs pruning).
*   **Success Metric:** Overall Gungnir Vigil score [V] > 8.0.

---

## 🚀 EXECUTION START
The beads are now **SET** in the Hall of Records. 
To begin the automated restoration loop, the operator should invoke:

```bash
cstar orchestrate --max-parallel 3 --epic pb-legacy
```

> "Excellence is the habit of small corrections. The diagnostic is over. The restoration begins."
