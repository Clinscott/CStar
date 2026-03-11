from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.engine.bead_ledger import BeadLedger


def main() -> int:
    parser = argparse.ArgumentParser(description="Project the sovereign bead ledger into tasks.qmd.")
    parser.add_argument("--check", action="store_true", help="Exit non-zero if tasks.qmd does not match the ledger projection.")
    args = parser.parse_args()

    ledger = BeadLedger(PROJECT_ROOT)

    if args.check:
        if ledger.projection_matches():
            print("tasks.qmd is in sync with the Sovereign Bead System.")
            return 0
        print("tasks.qmd is out of sync with the Sovereign Bead System.")
        return 1

    active_count = ledger.sync_tasks_projection()
    print(f"Projected {active_count} active beads into tasks.qmd.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
