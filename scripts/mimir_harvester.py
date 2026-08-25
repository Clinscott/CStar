#!/usr/bin/env python3
"""Fail-closed tombstone for the retired Mimir lesson harvester.

The former script opened PennyOne SQLite, inserted model-written Hall lessons,
and projected them into ``.lore/lessons``. Canonical memory now requires an
explicit operator-reviewed CStar lifecycle, so this compatibility path must
never inspect targets, open a database, create directories, or write files.
"""

from __future__ import annotations

import sys
from collections.abc import Sequence


DECOMMISSIONED_MESSAGE = (
    "mimir_harvester is decommissioned: model-generated lessons cannot be "
    "written or promoted to canonical CStar memory."
)


def main(argv: Sequence[str] | None = None) -> int:
    """Reject every legacy invocation before touching caller-supplied paths."""
    del argv
    print(DECOMMISSIONED_MESSAGE, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
