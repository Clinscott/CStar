---
description: Finalizes the current session, updates documentation, runs a production build, and shuts down all development servers.
---

// turbo-all
// turbo-all
1. **Execute SovereignFish Protocol (Manual Agent Action)**: Read `.agent/workflows/SovereignFish.qmd`. Identify 2 improvements using your own intelligence (not the script). Implement and log them in `SovereignFish.qmd`.
2. **Verify Codebase Integrity**:
   - Run `python -m ruff check . --select E9,F63,F7,F82` to ensure no syntax errors or undefined names.
   - Run `python -m pytest` to ensure all tests pass.
   - **CRITICAL**: If either fails, FIX THEM before proceeding. Do not wrap up a broken session.
3. **Compile Neural Traces**: Run `python .agent/scripts/compile_session_traces.py` to generate the session's `TRACE_REPORT.qmd`. Persona data is now strictly grouped for clarity.
4. **Update GEMINI Manifest**: Run `python .agent/scripts/update_gemini_manifest.py` to refresh the AI-to-AI context bridge.
5. **Modify Tasks**: Modify existing tasks in `tasks.qmd` as completed. **Do not overwrite history.**
6. **Review & Update Wireframe**: Check `wireframe.qmd` against your changes. If you added new pages, components, or services, YOU MUST update `wireframe.qmd` to match the codebase.
7. **Next Priority**: Add a `## ⏭️ Start Here Next` section at the bottom of `tasks.qmd` with a detailed, step-by-step plan for the next priority.
8. **Update Walkthrough**: Update `walkthrough.qmd` with all session accomplishments.
9. **Update Dev Journal**: Update `dev_journal.qmd` with a new entry for today or append to today's entry. Include achievements and architectural decisions.
10. **Update Memory**: Update `memory.qmd` with critical context and learned project patterns.
11. **Shutdown Servers**: Shut down all development servers and verify ports are clear.
   `Get-Process -Id (Get-NetTCPConnection -LocalPort 3000, 3003 -State Listen -ErrorAction SilentlyContinue).OwningProcess -ErrorAction SilentlyContinue | Stop-Process -Force`
12. **Production Build**: Run a final production build to ensure stability.
   `npm run build`
13. **Final Persona Notification**: Output MUST be persona-filtered and include:
    - **ODIN**: A final decree on progress. Successes are "Dominion Expanded". Use Red/Bold.
    - **ALFRED**: A humble report on service rendered. Successes are "Mission Objectives Secured". Use Cyan.
    - **Git Commit Summary**: Provide a ready-to-copy code block for the git commit message.
14. **The Session Handshake**:
    - Identify the "Session Delta": what specifically changed.
    - Update `walkthrough.qmd` with a "Session Handshake" section.
    - State: "To resume, start here."
15. **Knowledge Extraction**: Run `python .agent/scripts/synapse_sync.py --push --dry-run` then `--push` if valid.
16. **Background Neural Training**: Trigger the `AtomicCortex` training loop to evolve project alignment.
    `python src/core/engine/atomic_gpt.py --train 500`
17. **Generate Commit Description**: Include a ready-to-copy markdown block for the git commit message. Format:
   ```
   [ALFRED/ODIN] [Short summary of main feature]
   
   - [Bullet point 1]
   - [Bullet point 2]
   - File 1 (modified)
   - File 2 (created)
   ```
