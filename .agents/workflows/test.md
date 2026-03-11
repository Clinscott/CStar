---
description: The Standard Protocol for Verifying Code Integrity and preventing Regression.
---
# Intent: Verify integrity, run tests, debug logic, check regression, fuzz code, benchmark contract, validate performance.

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
2.  **Wireframe**: Does `wireframe.qmd` need updates?

## 3. **Phase 3: The Validation Envelope (System)**
Run the Engine's verification surfaces and collect one canonical promotion envelope.
1.  **Crucible**: run the targeted tests for the candidate.
2.  **SPRT**: execute `python sterileAgent/fishtest.py --file fishtest_live.json --mode heuristic`.
3.  **Benchmark**: run the benchmark path if latency or startup performance is part of the bead.
4.  **Gungnir Delta**: capture pre-forge and post-forge scores.
5.  **Promotion Gate**:
    -   **ACCEPTED**: all required checks passed and `logic`, `style`, and `sovereignty` did not regress.
    -   **INCONCLUSIVE**: evidence is incomplete; do not promote.
    -   **REJECTED**: any failed check, rejected SPRT, or negative protected Gungnir delta blocks promotion.

## 4. **Phase 4: The Verdict**
Summarize the State.

-   **🟢 GREEN (All Clear)**:
    -   "All systems nominal. Validation envelope accepted."
    -   **Next Command**: `/wrap-it-up` (to finalize and commit).

-   **🔴 RED (Failure)**:
    -   "Weakness Detected. Promotion gate remains closed."
    -   **Next Command**: `/investigate` (to fix the tests).
