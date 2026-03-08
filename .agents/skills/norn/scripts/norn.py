import argparse
import sys
import sqlite3
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.norn_coordinator import NornCoordinator

def main():
    parser = argparse.ArgumentParser(description="Norn Coordinator: Manage the task ledger.")
    parser.add_argument("--sync", action="store_true", help="Sync tasks.qmd with database")
    parser.add_argument("--spin-scan-beads", action="store_true", help="Generate scan beads for all sectors")
    parser.add_argument("--next", action="store_true", help="Get next bead")
    parser.add_argument("--agent", default="ALFRED")
    parser.add_argument("--resolve", type=int, help="Resolve a specific bead by ID")
    
    args = parser.parse_args()

    coordinator = NornCoordinator(PROJECT_ROOT)

    if args.sync:
        count = coordinator.sync_tasks()
        print(f"[🔱] Ledger synchronized. {count} new beads spun.")
    elif args.spin_scan_beads:
        print("[🔱] Norns: Spinning scan beads for the entire repository...", file=sys.stderr)
        # Identify major sectors
        sectors = ["src/core", "src/node", "src/tools", "src/sentinel", "scripts", "sterileAgent"]
        for s in sectors:
            if (PROJECT_ROOT / s).exists():
                # Manually inject scan beads into the database
                conn = sqlite3.connect(str(PROJECT_ROOT / ".stats" / "pennyone.db"))
                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO norn_beads (description, status, agent_id) VALUES (?, ?, ?)",
                    (f"SCAN_SECTOR: {s}", "OPEN", "HUGINN")
                )
                conn.commit()
                conn.close()
                print(f"  ▷ Bead spun for sector: {s}")
        print("[ALFRED]: The scan necklace is prepared, sir.")
    elif args.next:
        bead = coordinator.get_next_bead(args.agent)
        if bead:
            print(f"[🔱] Bead {bead['id']} assigned to {args.agent}: {bead['description']}")
        else:
            print("[ALFRED]: No open beads remaining in the ledger, sir.")
    elif args.resolve:
        coordinator.resolve_bead(args.resolve)
        print(f"[🔱] Bead {args.resolve} resolved. tasks.qmd updated.")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
