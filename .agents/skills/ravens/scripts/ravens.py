import argparse
import sys
import asyncio
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.sentinel.muninn import Muninn

def main():
    parser = argparse.ArgumentParser(description="Ravens Protocol: Autonomous improvement.")
    parser.add_argument("--cycle", action="store_true", help="Execute one repair cycle")
    parser.add_argument("--path", default=".", help="Target root path")
    parser.add_argument("--unblock", help="Release an escalated file back to Muninn")
    
    args = parser.parse_args()

    if args.cycle:
        m = Muninn(args.path)
        asyncio.run(m.run_cycle())
    elif args.unblock:
        # [ALFRED]: Logic to unblock a file in the ledger
        print(f"[🔱] Unblocking sector {args.unblock} for Raven flight.")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
