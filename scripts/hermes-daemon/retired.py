#!/usr/bin/env python3
"""Shared fail-closed entrypoint for retired public Hermes daemon scripts."""

from __future__ import annotations

import json
import sys


CODE = "CSTAR_PUBLIC_HERMES_DAEMON_DECOMMISSIONED"
MESSAGE = (
    "Public Hermes spoke daemons are decommissioned. Implementation uses the "
    "durable cstar_forge_request -> cstar_forge_execute private adapter; "
    "research uses authorized Researcher lanes."
)


class PublicHermesDaemonDecommissioned(RuntimeError):
    """Raised by stale library callers of the retired daemon lane."""


def reject() -> None:
    raise PublicHermesDaemonDecommissioned(MESSAGE)


def main() -> int:
    print(
        json.dumps({"ok": False, "code": CODE, "message": MESSAGE}, sort_keys=True),
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
