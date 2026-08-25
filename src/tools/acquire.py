#!/usr/bin/env python3
"""Fail-closed tombstone for the retired direct skill-acquisition tool.

Reusable capabilities must be proposed, built, validated, and promoted through
the current host/CStar authority path.  This compatibility module deliberately
performs no search, model invocation, clone, or filesystem write.
"""

from __future__ import annotations

import argparse
import asyncio
import sys


DECOMMISSION_MESSAGE = (
    "Direct skill acquisition is decommissioned. Use the current host skill-first "
    "workflow and record any build or promotion through CStar."
)


class SkillAcquisitionDecommissioned(RuntimeError):
    """Raised when a caller reaches the retired acquisition compatibility API."""


class SkillAcquirer:
    """Compatibility surface that permanently rejects direct acquisition."""

    @staticmethod
    async def hunt_and_forge(query: str, skill_name: str | None = None) -> None:
        """Reject the retired Brave/Antigravity acquisition path without side effects."""
        del query, skill_name
        raise SkillAcquisitionDecommissioned(DECOMMISSION_MESSAGE)


async def _run(args: argparse.Namespace) -> int:
    try:
        await SkillAcquirer.hunt_and_forge(args.query, args.name)
    except SkillAcquisitionDecommissioned as error:
        print(str(error), file=sys.stderr)
        return 2
    return 0


def main() -> int:
    """Retain a deterministic CLI tombstone for stale callers."""
    parser = argparse.ArgumentParser(
        description="Retired Corvus Star direct skill-acquisition compatibility command",
    )
    parser.add_argument("query", help="Legacy query; never sent to a network or model")
    parser.add_argument("--name", help="Legacy name; never written")
    args = parser.parse_args()
    return asyncio.run(_run(args))


if __name__ == "__main__":
    raise SystemExit(main())
