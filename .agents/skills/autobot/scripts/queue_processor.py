#!/usr/bin/env python3
"""Retired AutoBot compatibility tombstone."""

from __future__ import annotations

import sys


RETIRED_ERROR = "legacy_autobot_retired_use_cstar_forge"


def main() -> int:
    """Fail closed without inspecting arguments or touching external state."""
    print(RETIRED_ERROR, file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
