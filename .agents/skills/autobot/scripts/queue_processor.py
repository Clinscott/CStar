#!/usr/bin/env python3
"""Fail-closed tombstone for the retired public AutoBot queue worker."""

from __future__ import annotations

import json

DECOMMISSIONED_ERROR = (
    "autobot_permanently_decommissioned: queued AutoBot work cannot execute"
)


def process_queue(*_args: object, **_kwargs: object) -> dict[str, object]:
    """Refuse stale worker callers without claiming, spending, or writing."""
    return {
        "status": "blocked",
        "error": DECOMMISSIONED_ERROR,
        "live_spend": False,
        "processed": 0,
    }


def main() -> int:
    print(json.dumps(process_queue(), sort_keys=True))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
