#!/usr/bin/env python3
"""Fail-closed tombstone for the retired file-content cache side channel."""

from __future__ import annotations

import json
import sys


CODE = "CSTAR_CACHEBRO_DECOMMISSIONED"
MESSAGE = (
    "CacheBro is decommissioned. It no longer copies repository content into "
    "an untracked .agents cache or bootstraps runtime state."
)


class CacheBroDecommissioned(RuntimeError):
    """Raised when a stale caller reaches the retired cache path."""


class CacheBro:
    """Compatibility API that rejects former cache reads and resets."""

    def read_file(self, file_path: str) -> str:
        del file_path
        raise CacheBroDecommissioned(MESSAGE)

    def reset(self) -> None:
        raise CacheBroDecommissioned(MESSAGE)


def main(argv: list[str] | None = None) -> int:
    del argv
    print(json.dumps({"ok": False, "code": CODE, "message": MESSAGE}), file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
