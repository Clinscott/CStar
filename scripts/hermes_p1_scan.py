#!/usr/bin/env python3
"""Retired direct spoke scanner and Hall bead writer tombstone."""

import sys
from typing import Any


ERROR = "legacy_autonomous_scan_retired_use_cstar_researcher"


def hermes_p1_scan(spoke_root: str, spoke_slug: str | None = None) -> dict[str, Any]:
    del spoke_root, spoke_slug
    raise RuntimeError(ERROR)


def main() -> int:
    sys.stderr.write(f"{ERROR}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
