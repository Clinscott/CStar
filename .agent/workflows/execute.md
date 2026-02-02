---
description: The Standard Protocol for turning a generic Plan into concrete Code.
---

# The Execution Protocol (/execute)

> [!CRITICAL]
> **Identity Check**: Perform via **Active Persona** (`config.json`).
> **Prerequisite**: An approved `implementation_plan.md` must exist.

## 1. **Phase 1: The Context Load**
1.  **Read the Plan**: Ingest `implementation_plan.md`.
2.  **Read the Map**: Ingest `wireframe.md`.
3.  **Read the Soul**: Ingest `AGENTS.md` (Design & Testing Mandates).

## 2. **Phase 2: The Forge (Code Generation)**
Execute the plan step-by-step.

### 🛠️ The Rules of Construction
1.  **Atomic Units**: Create one component at a time.
2.  **Linscott Standard**:
    -   **IF** you create a file logic file (e.g., `utils.py`),
    -   **THEN** you MUST immediately create its verifier (e.g., `tests/test_utils.py`).
    -   *Do not wait for the `/test` phase to create the file. Create it now.*
3.  **Persona Voice**:
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
