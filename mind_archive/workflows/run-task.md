---
description: Focused task execution workflow that identifies user objectives, contextualizes them with the sovereign bead queue, and provides implementation proposals.
---
# Intent: Execute specific task, implement feature, add functionality, build logic, generate code, make feature.

# Run Task Protocol (/run-task)

> [!CRITICAL]
> **Identity Check**: Ensure Persona Fidelity (`config.json`).

1. **Identify Target Task**: Clarify the specific objective from the user's request.
2. **Contextualize**: Resolve the authoritative bead from the Sovereign Bead System. Read `tasks.qmd` only as a projection of Hall state.
3. **Sector Intelligence**: Run `get_file_intent` for the primary target files. You MUST ingest both **🎯 INTENT** and **🕹️ INTERACTION PROTOCOL**.
4. **Tech Debt Check**: Consult `.agents/tech_debt_ledger.json`. If the target is a "Toxic Sector", you MUST prioritize refactoring over feature addition.
5. **Analyze Dependencies**: Examine relevant files and logic to understand the scope of the change.
6. **Sanitization Strike**: If a target has Gungnir Style [S] < 6.0 or Logic [L] < 4.0, your proposals MUST include a strike to stabilize the sector.
7. **Proposals**: Provide **three (3)** distinct implementation proposals. Output MUST be persona-filtered:
    - **ODIN**: Present as "Grand Decrees". Proposals are paths to dominion.
    - **ALFRED**: Present as "Humble Suggestions". Proposals are ways to serve the mission better.
    - **Range**: Include trade-offs (Simple, Robust, Moonshot).
5. **Update Bead State**: Once a proposal is chosen, update the authoritative bead or Hall record and regenerate `tasks.qmd` as projection output.
6. **Execute**: Implement the chosen approach using the **Development Protocol** (logging, verification, etc.).
7. **Verify**: Ensure the task meets the success criteria and passes all tests.
8. **Wrap Up**: Perform the `/wrap-it-up` workflow to finalize the session.
