---
description: Finalizes the current session, updates documentation, runs a production build, and shuts down all development servers.
---

// turbo-all
1. **Execute SovereignFish**: Run the SovereignFish protocol (`SovereignFish.md`). Identify, fix, and log 2 minor improvements. Verify with `fishtest.py`.
6. 2. **Compile Neural Traces**: Run `python .agent/scripts/compile_session_traces.py` to generate the session's `TRACE_REPORT.md`.
3. Modify existing tasks in `tasks.md` as completed. **Do not overwrite history.**
2. **Review & Update Wireframe**: Check `wireframe.md` against your changes. If you added new pages, components, or services, YOU MUST update `wireframe.md` to match the codebase.
3. Add a `## ⏭️ Start Here Next` section at the bottom of `tasks.md` with a detailed, step-by-step plan for the next priority.
3. Update `walkthrough.md` with all session accomplishments.
4. Update `DEV_JOURNAL.md` with a new entry for today (if one doesn't exist) or append to today's entry. Include a high-level summary of what was accomplished, any architectural decisions made, and the current state of the project.
5. Update `memory.md` with critical context, learned project patterns, and architectural decisions to preserve long-term knowledge.
6. Shut down all development servers and verify ports are clear.
   `Get-Process -Id (Get-NetTCPConnection -LocalPort 3000, 3003 -State Listen -ErrorAction SilentlyContinue).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force`
714. Run a final production build to ensure stability.
   `npm run build`
8. Summarize the state and provide a definitive handoff message. Output MUST be persona-filtered:
    - **ODIN**: A final decree on progress. Successes are "Dominion Expanded".
    - **ALFRED**: A humble report on service rendered. Successes are "Mission Objectives Secured".

9. **The Session Handshake**:
    - You MUST identify the "Session Delta": what specifically changed from the start of this session to now.
    - Update `walkthrough.md` with a specific "Session Handshake" section that serves as the starting point for the next session.
    - This section must explicitly state: "To resume, start here."
9. **Generate Commit Description**: Include a ready-to-copy markdown block for the git commit message. Format:
   ```
   ## Commit Message (copy below)
   
   ```
   feat: [Short summary of main feature]
   
   - [Bullet point 1: Key change]
   - [Bullet point 2: Key change]
   - [Bullet point 3: Key change]
   
   Files changed:
   - [path/to/file1]
   - [path/to/file2]
   ```
   ```
