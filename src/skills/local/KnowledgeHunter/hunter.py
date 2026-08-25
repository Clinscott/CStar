#!/usr/bin/env python3
"""Import-safe tombstone for the retired direct KnowledgeHunter workflow."""

from __future__ import annotations

import sys
from typing import NoReturn


RETIRED_PYTHON_SOURCE_TOOL_ERROR = (
    "legacy_python_source_tools_retired_use_authorized_researcher"
)


def _retired(*_args: object, **_kwargs: object) -> NoReturn:
    raise RuntimeError(RETIRED_PYTHON_SOURCE_TOOL_ERROR)


class KnowledgeHunter:
    """Passive compatibility object with no source or provider capability."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        pass

    async def hunt(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()


def main() -> int:
    """Reject the former direct research CLI before reading its arguments."""

    sys.stderr.write(f"{RETIRED_PYTHON_SOURCE_TOOL_ERROR}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
