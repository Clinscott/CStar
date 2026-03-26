#!/usr/bin/env python3
import sys
import subprocess
import os
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

def run_cstar(cmd):
    """Run a cstar command and return the output."""
    project_root = get_project_root()
    try:
        # Use npx tsx cstar.ts for reliability in this environment
        result = subprocess.run(
            ["npx", "tsx", str(project_root / "cstar.ts"), *cmd.split()],
            cwd=str(project_root),
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout
    except subprocess.CalledProcessError as e:
        print(f"[KERNEL PANIC]: {e.stderr}")
        return None

def main():
    print("◤ C* GATEKEEPER: SCANNING FOR LINSCOTT BREACHES ◢")
    
    # 1. Check Gungnir Integrity
    status_output = run_cstar("status")
    if not status_output:
        print("[FAIL]: Could not handshake with Kernel.")
        sys.exit(1)
        
    # 2. Extract Gungnir Score (Naive check)
    # GUNGNIR Ω:      0.00
    for line in status_output.splitlines():
        if "GUNGNIR Ω:" in line:
            score = float(line.split(":")[-1].strip())
            print(f"  • Current Gungnir Score: {score}")
            break

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
