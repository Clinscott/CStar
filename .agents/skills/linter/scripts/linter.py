import argparse
import sys
import json
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.prompt_linter import PromptLinter

def main():
    parser = argparse.ArgumentParser(description="Prompt Linter: Audit prompt integrity.")
    parser.add_argument("--score", action="store_true", help="Calculate integrity score")
    parser.add_argument("--dir", default=".agents/prompts")
    parser.add_argument("--audit", action="store_true", help="Audit specific file invocation")
    parser.add_argument("--file", help="Python file to audit")
    parser.add_argument("--vars", nargs="+", help="Expected variables")
    
    args = parser.parse_args()

    linter = PromptLinter()

    if args.score:
        score = linter.calculate_integrity_score(str(PROJECT_ROOT / args.dir))
        print(f"[🔱] Prompt Integrity Score: {score:.2f}%")
    elif args.audit and args.file and args.vars:
        success = linter.audit_python_invocation(str(PROJECT_ROOT / args.file), args.vars)
        if success:
            print(f"[🔱] Prompt invocation in {args.file} is synchronized.")
        else:
            print(f"[ALFRED]: CRITICAL - Variable mismatch detected in {args.file}.")
            sys.exit(1)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
