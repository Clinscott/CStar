import argparse
import sys
import subprocess
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

def main():
    parser = argparse.ArgumentParser(description="Gungnir Oracle: High-fidelity intelligence.")
    parser.add_argument("--query", required=True, help="The natural language query.")
    parser.add_argument("--system_prompt", help="Override the default system prompt.")
    args = parser.parse_args()

    # Trigger One Mind Skill via Dispatcher
    cstar_dispatcher = PROJECT_ROOT / "src" / "core" / "cstar_dispatcher.py"
    venv_python = PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
    if not venv_python.exists(): venv_python = Path(sys.executable)

    try:
        cmd = [
            str(venv_python), str(cstar_dispatcher), "one-mind",
            "--prompt", args.query
        ]
        if args.system_prompt:
            cmd.extend(["--system_prompt", args.system_prompt])
            
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        print(result.stdout if result.stdout else "The Oracle is silent.")

    except Exception as e:
        print(f"Oracle failed: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
