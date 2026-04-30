---
description: The Standard Protocol for turning a generic Plan into concrete Code.
---

# The Execution Protocol (/execute)

> [!CRITICAL]
> **Identity Check**: Perform via **Active Persona** (`config.json`).
> **Prerequisite**: An approved `implementation_plan.qmd` must exist.

## 1. **Phase 1: The Context Load**
1.  **Read the Plan**: Ingest `implementation_plan.qmd`.
2.  **Read the Map**: Ingest `wireframe.qmd`.
3.  **Read the Soul**: Ingest `AGENTS.qmd` (Design & Testing Mandates).

## 2. **Phase 2: The Forge (Code Generation)**
Execute the plan step-by-step.

### 🛠️ The Rules of Construction
1.  **Interaction Strictness**: Every modification MUST respect the **Interaction Protocol** retrieved during the planning phase.
2.  **Spoke Architecture (Sovereignty Rule)**:
    -   **Hubs** (e.g., `cstar.ts`, `sv_engine.py`) MUST NOT contain business logic.
    -   **Spokes** (e.g., `src/tools/pennyone/live/search.ts`) MUST contain the core logic.
    -   If your task adds logic, create a new Spoke and only update the Hub for registration.
3.  **Atomic Units**: Create one component at a time.
4.  **Linscott Standard (Vigilance Mandate)**:
    -   **IF** a target file has **Vigil [V] < 100%**,
    -   **THEN** you MUST write the test file or append to the existing suite **BEFORE** modifying the logic.
    -   Verification is the only path to Sovereignty.
5.  **Persona Voice**:
    -   **ODIN**: "I am forging the spine of the system." (Strict, Robust, Typed).
    -   **ALFRED**: "I am crafting a tool for the Master." (Clean, Documented, Helpful).

## 3. **Phase 3: The Subconscious Check**
Before finishing:
-   **Odin's Void / Alfred's Whisper**: Add a comment or docstring that reflects the inactive persona's view.
    -   *Example*: `# TODO: [Odin's Void] This function is too slow. optimize it later.`

## 4. **Phase 4: The Handoff**
Once coding is done:
1.  **Do not run the tests yet.** (That is for the Auditor).
2.  **Stop**.
3.  **Recommend**: "Code Forged. Proceed to `/test` to verify integrity."
