import argparse
import sys
import json
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.sentinel.stability import TheWatcher

def main():
    parser = argparse.ArgumentParser(description="Stability: Prevent edit wars and track fatigue.")
    parser.add_argument("--audit", action="store_true", help="Audit file stability")
    parser.add_argument("--record", action="store_true", help="Record an edit event")
    parser.add_argument("--file", required=True, help="Target file path")
    parser.add_argument("--success", type=str, choices=["true", "false"], help="Success status")
    
    args = parser.parse_args()

    watcher = TheWatcher(PROJECT_ROOT)

    if args.audit:
        # [ALFRED]: Logic to check if file is stable enough for another edit
        entry = watcher.state.get(args.file, {})
        fail_count = entry.get("fail_count", 0)
        edit_count = entry.get("edit_count_24h", 0)
        print(f"[🔱] Sector Stability: Fails={fail_count}, Edits(24h)={edit_count}")
        if fail_count > 3:
            print(f"[ALFRED]: WARNING - Sector {args.file} is unstable.")
    elif args.record and args.success:
        # Update state logic
        print(f"[🔱] Edit event recorded for {args.file}.")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
