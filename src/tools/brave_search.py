#!/usr/bin/env python3
"""Import-safe tombstone for the retired direct Brave Search client.

Research is requested through CStar's authorized Researcher lane.  This module
retains its compatibility type without reading credentials, quota state, live
sources, or repository files.
"""

from __future__ import annotations

import sys
from typing import NoReturn


RETIRED_PYTHON_SOURCE_TOOL_ERROR = (
    "legacy_python_source_tools_retired_use_authorized_researcher"
)


def _retired(*_args: object, **_kwargs: object) -> NoReturn:
    raise RuntimeError(RETIRED_PYTHON_SOURCE_TOOL_ERROR)


class BraveSearch:
    """No-effect compatibility shell for the former direct source client."""

    MAX_QUOTA = 0
    QUOTA_FILE = None

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        # Construction is intentionally passive so legacy imports and object
        # graphs do not gain source or credential access.
        pass

    _ensure_quota_ledger = staticmethod(_retired)
    _read_ledger = staticmethod(_retired)
    _save_ledger = staticmethod(_retired)
    _increment_quota = staticmethod(_retired)
    is_quota_available = staticmethod(_retired)
    search = staticmethod(_retired)
    search_knowledge = staticmethod(_retired)


def main() -> int:
    """Return the stable migration error without reading arguments or secrets."""

    sys.stderr.write(f"{RETIRED_PYTHON_SOURCE_TOOL_ERROR}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
