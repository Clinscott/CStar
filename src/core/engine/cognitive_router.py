"""Import-safe tombstone for the retired Python cognitive execution router."""

from __future__ import annotations

from typing import Any

from src.core.mimir_client import (
    RETIRED_PYTHON_INTELLIGENCE_ROUTER_ERROR,
)


def _fail_retired_intelligence_router() -> None:
    raise RuntimeError(RETIRED_PYTHON_INTELLIGENCE_ROUTER_ERROR)


class CognitiveRouter:
    """Historical router retained only to return the stable retirement error."""

    def __init__(self, *_args: Any, **_kwargs: Any) -> None:
        _fail_retired_intelligence_router()

    async def route_intent(self, *_args: Any, **_kwargs: Any) -> None:
        _fail_retired_intelligence_router()

    async def _evaluate_safety(self, *_args: Any, **_kwargs: Any) -> None:
        _fail_retired_intelligence_router()

    async def _translate_intent(self, *_args: Any, **_kwargs: Any) -> None:
        _fail_retired_intelligence_router()

    async def _dispatch_wild_hunt(self, *_args: Any, **_kwargs: Any) -> None:
        _fail_retired_intelligence_router()

    async def _acquire_targets(self, *_args: Any, **_kwargs: Any) -> None:
        _fail_retired_intelligence_router()

    async def _execute_forge(self, *_args: Any, **_kwargs: Any) -> None:
        _fail_retired_intelligence_router()

    async def _run_learning_session(self, *_args: Any, **_kwargs: Any) -> None:
        _fail_retired_intelligence_router()
