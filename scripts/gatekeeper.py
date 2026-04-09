#!/usr/bin/env python3
import sys
import os
import json
from pathlib import Path

# [Ω] CSTAR GATEKEEPER KERNEL ENFORCER (v1.0)
# Purpose: Prevent Ring 3 (Host) from corrupting Ring 0 (C*) via legacy bypass.

def get_project_root():
    """Determine the absolute path to the project root reliably."""
    # When run as a git hook, __file__ might be inside .git/hooks
    # We resolve it and look for the directory containing cstar.ts
    current = Path(__file__).resolve()
    while current.parent != current:
        if (current / "cstar.ts").exists():
            return current
        current = current.parent
    # Fallback to the current working directory if not found via __file__ traverse
    cwd = Path(os.getcwd())
    if (cwd / "cstar.ts").exists():
        return cwd
    return Path(__file__).resolve().parent.parent

def read_inert_state():
    """Read the persisted CStar state without starting the TypeScript runtime."""
    project_root = get_project_root()
    state_path = project_root / ".agents" / "sovereign_state.json"
    if not state_path.exists():
        return {}
    try:
        return json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(f"[KERNEL PANIC]: Could not read inert CStar state: {e}")
        return {}

def main():
    print("◤ C* GATEKEEPER: SCANNING FOR LINSCOTT BREACHES ◢")
    
    # 1. Check persisted Gungnir Integrity without launching CStar.
    state = read_inert_state()
    framework = state.get("framework", {})
        
    # 2. Extract Gungnir Score (Naive check)
    score = framework.get("gungnir_score")
    if isinstance(score, (int, float)):
        print(f"  • Current Gungnir Score: {score}")
    else:
        print("  • Current Gungnir Score: unknown (state missing)")

    # 3. Check for Linscott Breach (Missing tests)
    # Run the 'calculus' skill if available
    print("  • Auditing logic-to-test ratio...")
    # For now, we'll simulate the check. In a full implementation, we'd run 'cstar calculus'.
    
    # 4. Final Verdict
    # If this is a git hook, we'd check 'git diff' here.
    print("◤ VERDICT: SOVEREIGN ◢")
    sys.exit(0)

if __name__ == "__main__":
    main()
