"""Import-safe tombstone for the retired Python intelligence router.

Provider selection, host CLI calls, Synapse/Hall access, Oracle process launch,
and callback execution belong to supported CStar surfaces, not this module.
"""

from __future__ import annotations

import sys
from typing import Any


RETIRED_PYTHON_INTELLIGENCE_ROUTER_ERROR = (
    "legacy_python_intelligence_router_retired_use_cstar_kernel"
)


def _fail_retired_intelligence_router() -> None:
    raise RuntimeError(RETIRED_PYTHON_INTELLIGENCE_ROUTER_ERROR)


class MimirClient:
    """Compatibility type whose operations are terminal and side-effect free."""

    def __init__(self, *_args: Any, **_kwargs: Any) -> None:
        pass

    async def request(self, _payload: Any) -> Any:
        _fail_retired_intelligence_router()

    async def think(self, _query: str, system_prompt: str | None = None) -> None:
        del system_prompt
        _fail_retired_intelligence_router()

    async def get_file_intent(self, _filepath: str) -> None:
        _fail_retired_intelligence_router()

    async def search_well(self, _query: str) -> None:
        _fail_retired_intelligence_router()

    async def index_sector(self, _filepath: str) -> None:
        _fail_retired_intelligence_router()

    async def call_tool(self, _server: str, _tool: str, _args: Any = None) -> None:
        _fail_retired_intelligence_router()

    async def close(self) -> None:
        _fail_retired_intelligence_router()


# Import compatibility remains inert; every operation on the singleton fails.
mimir = MimirClient()


def main() -> int:
    print(RETIRED_PYTHON_INTELLIGENCE_ROUTER_ERROR, file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
