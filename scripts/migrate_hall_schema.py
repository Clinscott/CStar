from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.engine.hall_schema import HallOfRecords


def count_rows(db_path: Path, table_name: str) -> int:
    if not db_path.exists():
        return 0

    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?",
            (table_name,),
        ).fetchone()
        if not row:
            return 0

        return int(conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0])


def build_report(hall: HallOfRecords) -> dict[str, object]:
    db_path = hall.db_path
    return {
        "db_path": str(db_path),
        "legacy": {
            "mission_traces": count_rows(db_path, "mission_traces"),
            "norn_beads": count_rows(db_path, "norn_beads"),
        },
        "hall": {
            "repositories": count_rows(db_path, "hall_repositories"),
            "scans": count_rows(db_path, "hall_scans"),
            "files": count_rows(db_path, "hall_files"),
            "beads": count_rows(db_path, "hall_beads"),
            "validation_runs": count_rows(db_path, "hall_validation_runs"),
            "skill_observations": count_rows(db_path, "hall_skill_observations"),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Initialize or migrate the canonical Hall schema.")
    parser.add_argument("--project-root", default=str(PROJECT_ROOT), help="Corvus Star workspace root")
    parser.add_argument("--dry-run", action="store_true", help="Report current and target Hall state without migrating")
    args = parser.parse_args()

    hall = HallOfRecords(Path(args.project_root))

    if args.dry_run:
        print(json.dumps({"mode": "dry-run", "report": build_report(hall)}, indent=2))
        return 0

    hall.ensure_schema()
    migrated = hall.migrate_legacy_records()
    print(
        json.dumps(
            {
                "mode": "apply",
                "migrated": migrated,
                "report": build_report(hall),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
