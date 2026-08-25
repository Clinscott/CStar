#!/usr/bin/env python3
"""Fail-closed tombstone for the retired direct autonomous edit loop.

The former command invoked Antigravity, rewrote targets, ran broad tests, and
committed changes outside the durable CStar/Forge lifecycle.  It remains only
as an import-compatible rejection surface with no side effects.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any


DECOMMISSION_MESSAGE = (
    "The direct autonomous edit loop is decommissioned. Implementation must use "
    "the durable CStar Forge request, execute, and independent validation path."
)


class LegacyExecutionLaneDecommissioned(RuntimeError):
    """Raised whenever a stale caller reaches the retired loop."""


class SovereignForge:
    """Compatibility facade that cannot generate, edit, verify, or commit code."""

    def __init__(self, root: Path) -> None:
        self.root = root

    def forge_task(self, task: dict[str, Any]) -> bool:
        del task
        raise LegacyExecutionLaneDecommissioned(DECOMMISSION_MESSAGE)


class SovereignLifecycle:
    """Compatibility facade that permanently rejects the retired loop."""

    @staticmethod
    def execute() -> None:
        raise LegacyExecutionLaneDecommissioned(DECOMMISSION_MESSAGE)


def main() -> int:
    try:
        SovereignLifecycle.execute()
    except LegacyExecutionLaneDecommissioned as error:
        print(str(error), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
