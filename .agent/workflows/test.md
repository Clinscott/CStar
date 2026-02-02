---
description: The Standard Protocol for Verifying Code Integrity and preventing Regression.
---

# The Testing Protocol (/test)

> [!CRITICAL]
> **Identity Check**: Perform via **Active Persona** (`config.json`).

## 1. **Phase 1: The Integrity Check (Unit)**
Target the specific files created in `/execute`.
1.  **Run Tests**: `pytest tests/test_new_feature.py`
2.  **Analyze**:
    -   **PASS**: [ODIN] "Strength Confirmed." / [ALFRED] "Functionality Verified."
    -   **FAIL**: Stop. Describe the failure. Trigger `/investigate` immediately.

## 2. **Phase 2: The Constellation Check (Integration)**
Does this break the larger system?
1.  **Dependencies**: Check files that import the new code.
2.  **Wireframe**: Does `wireframe.md` need updates?

## 3. **Phase 3: The Fishtest (System)**
Run the Engine's own verification suite to ensure NO REGRESSION in the agent itself.
1.  **Command**: `python fishtest.py`
2.  **Verdict**:
    -   **100% Pass**: The Engine is clean.
    -   **Any Fail**: **CRITICAL**. The Agent has damaged itself. Immediate Rollback or Fix required.

## 4. **Phase 4: The Verdict**
Summarize the State.

-   **🟢 GREEN (All Clear)**:
    -   "All systems nominal."
    -   **Next Command**: `/wrap-it-up` (to finalize and commit).

-   **🔴 RED (Failure)**:
    -   "Weakness Detected."
    -   **Next Command**: `/investigate` (to fix the tests).
