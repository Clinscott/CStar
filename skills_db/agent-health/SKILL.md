---
name: Agent Health
description: Diagnostic tool for the agents framework cleanliness and integrity.
---

# Agent Health

## Activation Words: health, check, status, verify, doctor, diagnostic, self-test

## Instructions
1. **Path Verification**:
   - Check existence of `.agent/` folder.
   - Verify `tasks.md`, `wireframe.md`, `memories.md` exist in root.
2. **Content Audit**:
   - Ensure `tasks.md` has an "Active Task" section.
   - Ensure `wireframe.md` has "Core Components".
3. **Engine Check**:
   - Run `python .agent/scripts/sv_engine.py "hello world" --json-only` to verify the vector engine returns valid JSON.
4. **Report**:
   - Print a health scorecard [PASS/FAIL] in the HUD.
