"""Import-safe tombstone for the retired live response harvester.

Historical response fixtures remain ordinary test data.  No compatibility
entrypoint may call a provider or write new recordings.
"""

from __future__ import annotations

import sys
from typing import Any, NoReturn


RETIRED_PYTHON_SOURCE_TOOL_ERROR = (
    "legacy_python_source_tools_retired_use_authorized_researcher"
)


def _retired(*_args: object, **_kwargs: object) -> NoReturn:
    raise RuntimeError(RETIRED_PYTHON_SOURCE_TOOL_ERROR)


class ResponseRecorder:
    """Compatibility shell which never invokes or persists an injected client."""

    def __init__(self, _client: Any = None) -> None:
        self.recordings: list[dict[str, Any]] = []

    async def record_call(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def save(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()


class Harvester:
    """Historical harvester retained only to reject live collection."""

    @staticmethod
    async def execute(*_args: object, **_kwargs: object) -> NoReturn:
        _retired()


def main() -> int:
    sys.stderr.write(f"{RETIRED_PYTHON_SOURCE_TOOL_ERROR}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
