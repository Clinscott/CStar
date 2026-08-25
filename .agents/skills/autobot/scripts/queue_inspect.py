#!/usr/bin/env python3
"""Fail-closed tombstone for the retired public AutoBot queue inspector."""

from __future__ import annotations

import json

DECOMMISSIONED_ERROR = "autobot_permanently_decommissioned: queue state is historical only"


def inspect_queue(*_args: object, **_kwargs: object) -> dict[str, object]:
    """Refuse stale callers without exposing or mutating historical queue state."""
    return {
        "status": "blocked",
        "error": DECOMMISSIONED_ERROR,
        "tasks": [],
    }


def main() -> int:
    print(json.dumps(inspect_queue(), sort_keys=True))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
