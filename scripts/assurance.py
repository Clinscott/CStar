#!/usr/bin/env python3
"""Retired provider-backed assurance handshake tombstone."""

import sys


ERROR = "legacy_assurance_retired_use_cstar_doctor"


async def ensure_hall_of_records() -> bool:
    raise RuntimeError(ERROR)


def main() -> int:
    sys.stderr.write(f"{ERROR}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
