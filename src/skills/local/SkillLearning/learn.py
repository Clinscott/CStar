#!/usr/bin/env python3
"""Fail-closed tombstone for the retired interactive skill-learning lane.

The former implementation accepted arbitrary repository URLs and delegated to
an untracked clone/promote path.  Importing or executing this module now has no
network, model, subprocess, bootstrap, prompt, or filesystem side effects.
"""

from __future__ import annotations

import sys


DECOMMISSION_MESSAGE = (
    "Interactive direct skill acquisition is decommissioned. Use the current "
    "host skill-first workflow and CStar lifecycle for proposals and promotion."
)


class SkillLearningDecommissioned(RuntimeError):
    """Raised when a stale caller invokes the retired learning lane."""


class SkillLearner:
    """Compatibility API that permanently rejects direct skill acquisition."""

    @staticmethod
    def execute() -> None:
        """Fail closed without reading input or changing state."""
        raise SkillLearningDecommissioned(DECOMMISSION_MESSAGE)


def main() -> int:
    """Return a deterministic nonzero status for stale CLI callers."""
    try:
        SkillLearner.execute()
    except SkillLearningDecommissioned as error:
        print(str(error), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
