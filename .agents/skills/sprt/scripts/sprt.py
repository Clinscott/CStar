import argparse
import sys
import json
import math
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tests.integration.project_fishtest import GungnirSPRT
from src.sentinel.stability import GungnirValidator

def main():
    parser = argparse.ArgumentParser(description="SPRT: Statistical verification.")
    parser.add_argument("--eval", action="store_true", help="Evaluate score delta")
    parser.add_argument("--pre", type=float, help="Previous GPHS score")
    parser.add_argument("--post", type=float, help="Current GPHS score")
    
    parser.add_argument("--trial", action="store_true", help="Record a trial result")
    parser.add_argument("--success", type=str, choices=["true", "false"], help="Trial success status")
    
    args = parser.parse_args()

    if args.eval and args.pre is not None and args.post is not None:
        validator = GungnirSPRT()
        result = validator.evaluate_delta(args.pre, args.post)
        print(f"[🔱] SPRT Evaluation: {result}")
    elif args.trial and args.success:
        # [ALFRED]: Logic to persist and evaluate sequential trials
        validator = GungnirValidator()
        validator.record_trial(args.success == "true")
        print(f"[🔱] Trial recorded. Current Status: {validator.status}")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
