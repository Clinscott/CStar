#!/usr/bin/env python3
"""Fail-closed tombstone for the retired public AutoBot queue intake."""

from __future__ import annotations

import json

DECOMMISSIONED_ERROR = (
    "autobot_permanently_decommissioned: use the receipt-bound "
    "cstar_forge_request -> cstar_forge_execute path"
)


def enqueue(*_args: object, **_kwargs: object) -> dict[str, object]:
    """Refuse stale queue callers without writing a task record."""
    return {
        "status": "blocked",
        "error": DECOMMISSIONED_ERROR,
        "live_spend": False,
        "wrote_to": None,
    }


def main() -> int:
    print(json.dumps(enqueue(), sort_keys=True))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
