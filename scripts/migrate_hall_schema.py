#!/usr/bin/env python3
"""Retired direct Hall schema migration tombstone."""

import sys


ERROR = "legacy_direct_hall_script_retired_use_cstar_kernel"


def main() -> int:
    sys.stderr.write(f"{ERROR}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
