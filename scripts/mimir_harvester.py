#!/usr/bin/env python3
"""Retired direct Hall lesson harvester tombstone."""

import sys
from typing import Any


ERROR = "legacy_direct_hall_script_retired_use_cstar_kernel"


class MimirHarvester:
    def __init__(self, db_path: str, project_root: str):
        self.db_path = db_path
        self.project_root = project_root

    def __getattr__(self, name: str) -> Any:
        del name
        raise RuntimeError(ERROR)

    def harvest(self, limit: int = 5) -> None:
        del limit
        raise RuntimeError(ERROR)


def main() -> int:
    sys.stderr.write(f"{ERROR}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
