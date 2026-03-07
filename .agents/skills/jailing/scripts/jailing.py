import argparse
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.sentinel.sandbox_warden import SandboxWarden

def main():
    parser = argparse.ArgumentParser(description="Jailing: Isolated skill execution.")
    parser.add_argument("--run", required=True, help="Path to Python skill to execute")
    parser.add_argument("--args", nargs="*", help="Arguments for the skill")
    parser.add_argument("--hunting", action="store_true", help="Enable network bridge for hunters")
    
    args = parser.parse_args()

    warden = SandboxWarden()
    result = warden.run_in_sandbox(Path(args.run), args.args, hunting=args.hunting)
    
    if result["stdout"]: print(result["stdout"])
    if result["stderr"]: print(result["stderr"], file=sys.stderr)
    
    if result["timed_out"]:
        print("[ALFRED]: Specimen exceeded time limit. Contained.")
        sys.exit(124)
    
    sys.exit(result["exit_code"])

if __name__ == "__main__":
    main()
