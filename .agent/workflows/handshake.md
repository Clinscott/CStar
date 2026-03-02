---
description: A lightweight session finalization protocol that updates core documentation to prepare for the next context window.
---

// turbo-all
1. **Update Tasks**: Mark completed items in `tasks.qmd`.
2. **Update Wireframe**: Ensure `wireframe.qmd` reflects any new files or structural changes (e.g., new components, scripts).
3. **Update Walkthrough**: Add a "Session Handshake" section to `walkthrough.qmd` summarizing the "Session Delta" (what changed).
4. **Update Dev Journal**: Log the session's achievements and architectural decisions in `dev_journal.qmd`.
5. **Update Memory**: Record new patterns or critical context in `memory.qmd`.
6. **Ghost Sweep**: Execute a manual or automated sweep of the staged diff to ensure NO secrets (API keys, tokens, URLs) are present.
7. **Gungnir Trajectory**: 
    - Compare the PRE-FORGE Gungnir Matrix with the POST-FORGE Matrix.
    - Record the delta in the session summary.
    - **Sovereignty Check**: If the Sovereignty [Ω] score has decreased, you MUST explain the regression or roll back.
8. **Generate Commit**: Output a ready-to-copy git commit message.
