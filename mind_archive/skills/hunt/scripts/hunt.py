import argparse
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# We delegate to the existing WildHunt implementation which has the robust logic
from src.skills.local.WildHunt.wild_hunt import WildHunt

def main():
    parser = argparse.ArgumentParser(description="The Wild Hunt: Autonomous Skill Acquisition.")
    parser.add_argument("--search", help="Search query for a missing capability")
    parser.add_argument("--ingest", help="URL of the repository to ingest")
    parser.add_argument("--name", help="Name to assign the new skill")
    
    args = parser.parse_args()
    hunter = WildHunt()

    if args.search:
        matches = hunter.search(args.search)
        if matches:
            for m in matches:
                print(f"[🔱] FOUND: {m}")
        else:
            print(f"[ALFRED]: \"No local matches for '{args.search}'. Releasing Ravens to the open web...\"")
            # In a full implementation, this triggers brave_search.py and auto-ingests
            
    elif args.ingest and args.name:
        hunter.ingest(args.ingest, args.name)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
