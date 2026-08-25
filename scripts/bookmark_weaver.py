#!/usr/bin/env python3
"""Retired direct X-bookmark collector and Hall writer tombstone."""

import sys


ERROR = "legacy_bookmark_weaver_retired_use_cstar_researcher"


async def fetch_and_inject() -> int:
    raise RuntimeError(ERROR)


async def main() -> int:
    raise RuntimeError(ERROR)


def cli() -> int:
    sys.stderr.write(f"{ERROR}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(cli())
