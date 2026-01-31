---
description: Prompts the agent to resume work from tasks.md by identifying current priorities and providing implementation proposals.
---

1. Read the latest `tasks.md` to identify the current priority and "Next Steps".
2. Check `memory.md` for long-term context, architectural rules, and past decisions.
3. If the task involves UI, check `wireframe.md` for existing components. **CRITICAL:** Ensure any new page is planned to be wrapped in `DashboardLayout` (HUD). Standalone pages are strictly prohibited for core features.
4. **Locate Files**: Consult the "Project Directory Structure" in `wireframe.md` to instantly find relevant API routes and components.
5.  **Verify Existing Architecture**:
    -   **STOP**: Does this task imply replacing an existing page?
    -   **CHECK**: Why is the current one there? Can it be improved instead of deleted?
    -   **RULE**: "Improvement" means keeping the spirit of the current structure while fixing the bugs/issues.
6.  Analyze dependencies and examine relevant files to understand the current state.
7.  **Check for ambiguity:** Ensure dialogue happens if answers are needed. Do not make assumptions. Make informed decisions based on current principles but ask clarifying questions when needed.
7. Provide **three (3)** distinct proposals for the immediate implementation approach, including trade-offs for each.
8. Once a proposal is chosen by the user, perform the `/investigate` workflow on the chosen approach to identify potential risks, design patterns, and necessary refactors.
9. Update `tasks.md` with a detailed task breakdown for the implementation phase (preserving history).
10. **Implement Choice**: Execute the implementation phase. Follow the **Development Protocol**: When developing components, wrap logic in try/catch blocks and log errors to the console. Start with extensive logging, but once tests verify the component is working, *you must remove* the console logs to keep the codebase clean.
11. **Wrap It Up**: Once the investigation and implementation phase is done, perform the `/wrap-it-up` workflow to finalize the session and ensure stability.
