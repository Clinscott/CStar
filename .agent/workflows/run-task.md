---
description: Focused task execution workflow that identifies user objectives, contextualizes them with tasks.qmd, and provides implementation proposals.
---

# Run Task Protocol (/run-task)

> [!CRITICAL]
> **Identity Check**: Ensure Persona Fidelity (`config.json`).

1. **Identify Target Task**: Clarify the specific objective from the user's request.
2. **Contextualize**: Read `tasks.qmd` to see where this fits in the overall project progress.
3. **Analyze Dependencies**: Examine relevant files and logic to understand the scope of the change.
4. **Proposals**: Provide **three (3)** distinct implementation proposals. Output MUST be persona-filtered:
    - **ODIN**: Present as "Grand Decrees". Proposals are paths to dominion.
    - **ALFRED**: Present as "Humble Suggestions". Proposals are ways to serve the mission better.
    - **Range**: Include trade-offs (Simple, Robust, Moonshot).
5. **Update Tasks**: Once a proposal is chosen, update `tasks.qmd` with a detailed step-by-step breakdown (preserving history).
6. **Execute**: Implement the chosen approach using the **Development Protocol** (logging, verification, etc.).
7. **Verify**: Ensure the task meets the success criteria and passes all tests.
8. **Wrap Up**: Perform the `/wrap-it-up` workflow to finalize the session.
