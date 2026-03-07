import argparse
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.lease_manager import LeaseManager

def main():
    parser = argparse.ArgumentParser(description="Task Locks: Manage exclusive agent leases.")
    parser.add_argument("--acquire", action="store_true", help="Acquire a lease")
    parser.add_argument("--release", action="store_true", help="Release a lease")
    parser.add_argument("--path", required=True, help="Target file path")
    parser.add_argument("--agent", default="ONE_MIND", help="Agent ID")
    parser.add_argument("--duration", type=int, default=300000, help="Lease duration in ms")
    
    args = parser.parse_args()

    manager = LeaseManager(PROJECT_ROOT)

    if args.acquire:
        success = manager.acquire_lease(args.path, args.agent, args.duration)
        if success:
            print(f"[🔱] Lease acquired for {args.path} by {args.agent}")
        else:
            print(f"[ALFRED]: Sector {args.path} is currently locked by another Raven.")
            sys.exit(1)
    elif args.release:
        manager.release_lease(args.path, args.agent)
        print(f"[🔱] Lease released for {args.path}")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
