#!/usr/bin/env python3
"""Fail-closed tombstone for the retired Evolution Watch automation.

The former cron workflow scanned Hall SQLite directly, called web/model
providers, and wrote reports and wiki state outside the canonical Researcher
and CStar lifecycle. Keeping the import path lets stale callers fail clearly
without performing any work.
"""

from __future__ import annotations

import json
import sys


DECOMMISSIONED_CODE = "CSTAR_EVOLUTION_WATCH_DECOMMISSIONED"
DECOMMISSIONED_MESSAGE = (
    "CStar Evolution Watch is decommissioned. Use the authorized Researcher "
    "lane for source gathering and record bounded proposals through CStar."
)


class EvolutionWatchDecommissioned(RuntimeError):
    """Raised when a stale caller reaches the retired automation."""


def inspect_cstar() -> list[object]:
    """Reject the former direct inspection/report pipeline."""

    raise EvolutionWatchDecommissioned(DECOMMISSIONED_MESSAGE)


def main(argv: list[str] | None = None) -> int:
    del argv
    print(
        json.dumps(
            {
                "ok": False,
                "code": DECOMMISSIONED_CODE,
                "message": DECOMMISSIONED_MESSAGE,
                "successor": "Researcher -> CStar proposal lifecycle",
            },
            sort_keys=True,
        ),
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
