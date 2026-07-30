#!/usr/bin/env python3
"""Retired direct-Hermes FIFO sender tombstone."""

import sys


ERROR = "legacy_hermes_daemon_retired_use_cstar_forge_or_researcher"


def main() -> int:
    sys.stderr.write(f"{ERROR}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
