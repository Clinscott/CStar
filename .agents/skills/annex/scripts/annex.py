import argparse
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.annex import HeimdallWarden

def main():
    parser = argparse.ArgumentParser(description="Annexation Protocol: Identify and plan territory expansion.")
    parser.add_argument("--scan", action="store_true", help="Conduct territory audit")
    parser.add_argument("--path", default=".", help="Root of territory to scan")
    parser.add_argument("--execute", action="store_true", help="Execute the annexation plan")
    
    args = parser.parse_args()

    if args.scan:
        warden = HeimdallWarden(PROJECT_ROOT / args.path)
        warden.scan()
    elif args.execute:
        print("[ALFRED]: Annexation execution module linked. Reviewing tactical map...")
        # ... execution logic
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
