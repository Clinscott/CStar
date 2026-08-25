#!/usr/bin/env python3
"""Retired provider-backed intent harvester tombstone."""

import sys


ERROR = "legacy_autonomous_scan_retired_use_cstar_researcher"


class IntentHarvester:
    def __init__(self, target_n: int = 20):
        self.target_n = target_n

    async def harvest(self) -> None:
        raise RuntimeError(ERROR)


def main() -> int:
    sys.stderr.write(f"{ERROR}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
