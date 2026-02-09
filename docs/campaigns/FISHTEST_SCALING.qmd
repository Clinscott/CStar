# Fishtest Scaling Blueprint: The Road to N=1000

This document outlines the architectural roadmap for scaling the Corvus Star testing protocol (`fishtest`) from N=10 to N=1000 and beyond.

## Phase 1: Optimization (In-Process Execution)

**Status**: 🔴 Critical Bottleneck
**Problem**: Currently, `fishtest.py` spawns a new `subprocess` for every test case.
- **Cost**: ~100ms per call.
- **Impact**: N=1000 takes ~1.5 minutes. N=10,000 takes ~15 minutes.

**Solution**: Refactor `fishtest.py` to import `sv_engine` as a library.
- **Target Speed**: < 0.1ms per call.
- **Impact**: N=10,000 in < 10 seconds.

### Implementation Guide
1.  Modify `fishtest.py` to `from .agent.scripts.sv_engine import SovereignVector`.
2.  Initialize the engine **once** at the start of the test.
3.  Loop through test cases calling `engine.search(query)` directly.
4.  Remove all `subprocess.run` logic.

## Phase 2: Procedural Saturation (The "Swarm")

**Status**: 🟡 Manual Effort
**Problem**: Writing 1000 test cases by hand is unscalable.

**Solution**: Create a generator script (`scripts/generate_tests.py`) that uses combinatorial logic.

### Algorithm
1.  **Define Templates**:
    ```python
    templates = [
        "{action} {target}",
        "{action} the {target}",
        "please {action} {target}"
    ]
    ```
2.  **Define Vocab**:
    ```python
    vocab = {
        "/lets-go": {
            "action": ["start", "begin", "resume", "kick off"],
            "target": ["project", "work", "session", "tasks"]
        }
    }
    ```
3.  **Generate**: Iterate through templates and vocab to generate unique phrases.
4.  **Tagging**: Automatically tag generated cases as `"synthetic"`.

## Phase 3: Federation (Distributed Ingest)

**Status**: 🔵 Future State
**Problem**: Synthetic data doesn't capture real-world nuance.

**Solution**: Aggregation of user usage traces.

### Workflow
1.  **Export**: Agents run `compile_session_traces.py` to produce a JSON report.
2.  **Upload**: Reports are pushed to a central repository (or shared folder `mock_project/network_share`).
3.  **Merge**: A new script `tests/merge_traces.py` ingests these reports into `fishtest_data.json`.
    - **Conflict Resolution**: If a real user trace contradicts a synthetic test, the **real user trace wins**.

## Summary of Action

| Phase | Metric | Action Required |
| :--- | :--- | :--- |
| **1. Optimization** | Speed | Refactor `fishtest.py` to use Python imports. |
| **2. Saturation** | Volume | Build `generate_tests.py`. |
| **3. Federation** | Realism | Implement Trace Merge logic. |

*This blueprint relies on the "Triple Threat" architecture established in version 1.0.0.*
