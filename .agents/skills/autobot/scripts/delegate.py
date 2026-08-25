#!/usr/bin/env python3
"""Fail-closed tombstone for the retired public AutoBot delegate."""

from __future__ import annotations

import json

DECOMMISSIONED_ERROR = (
    "autobot_permanently_decommissioned: use the receipt-bound "
    "cstar_forge_request -> cstar_forge_execute path"
)


def fail_closed(*_args: object, **_kwargs: object) -> dict[str, object]:
    """Return a stable non-executing result for stale import callers."""
    return {
        "status": "blocked",
        "error": DECOMMISSIONED_ERROR,
        "live_spend": False,
        "live_source_collection": False,
        "wrote_to": None,
    }


def delegate(*args: object, **kwargs: object) -> dict[str, object]:
    """Refuse the retired delegation route without reading targets or spawning."""
    return fail_closed(*args, **kwargs)


def main() -> int:
    print(json.dumps(fail_closed(), sort_keys=True))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
