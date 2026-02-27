"""
Persona Switcher
Identity: ALFRED
Purpose: Change active persona context.
Target: scripts/set_persona.py
"""
import subprocess
import sys
from pathlib import Path

# Bootstrap Project Root
PROJECT_ROOT = Path(__file__).parents[2]

if __name__ == "__main__":
    script_path = PROJECT_ROOT / "scripts" / "set_persona.py"
    if not script_path.exists():
        print(f"Error: {script_path} not found.")
        sys.exit(1)

    # Pass along arguments
    result = subprocess.run([sys.executable, str(script_path), *sys.argv[1:]])
    sys.exit(result.returncode)
