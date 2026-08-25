#!/usr/bin/env python3
"""Fail-closed tombstone for retired direct web/model research.

Research must use the authorized Researcher lanes and durable receipts.  This
module performs no Brave search, model call, bootstrap, or artifact write.
"""

from __future__ import annotations

import asyncio
import sys


DECOMMISSION_MESSAGE = (
    "Direct KnowledgeHunter research is decommissioned. Use the authorized "
    "Researcher lane and preserve bounded source and artifact receipts in CStar."
)


class KnowledgeHunterDecommissioned(RuntimeError):
    """Raised when a stale caller reaches the retired research lane."""


class KnowledgeHunter:
    """Compatibility API that permanently rejects direct research execution."""

    async def hunt(self, topic: str) -> None:
        del topic
        raise KnowledgeHunterDecommissioned(DECOMMISSION_MESSAGE)


async def _run(topic: str) -> int:
    try:
        await KnowledgeHunter().hunt(topic)
    except KnowledgeHunterDecommissioned as error:
        print(str(error), file=sys.stderr)
        return 2
    return 0


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    topic = " ".join(args)
    return asyncio.run(_run(topic))


if __name__ == "__main__":
    raise SystemExit(main())
