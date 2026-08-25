#!/usr/bin/env python3
"""Fail-closed tombstone for the unregistered legacy SkillLearning CLI."""

from __future__ import annotations

import sys


RETIRED_ERROR = "legacy_skill_learning_retired_use_cstar_forge"


class SkillLearner:
    """Compatibility surface that cannot reactivate legacy skill acquisition."""

    @staticmethod
    def execute() -> None:
        """Reject programmatic calls with the stable retirement code."""
        raise RuntimeError(RETIRED_ERROR)


def main() -> int:
    """Reject CLI calls without imports, prompts, source access, or writes."""
    print(RETIRED_ERROR, file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
