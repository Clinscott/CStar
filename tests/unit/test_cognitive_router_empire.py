from __future__ import annotations

import inspect

import pytest

from src.core.engine.cognitive_router import CognitiveRouter
from src.core.mimir_client import RETIRED_PYTHON_INTELLIGENCE_ROUTER_ERROR


def test_cognitive_router_construction_is_terminal_before_path_or_callback_access():
    class Poison:
        def __getattribute__(self, _name):
            raise AssertionError("retired router inspected its input")

    with pytest.raises(RuntimeError, match=RETIRED_PYTHON_INTELLIGENCE_ROUTER_ERROR):
        CognitiveRouter(Poison())


@pytest.mark.asyncio
async def test_cognitive_router_route_stays_terminal_if_construction_is_bypassed():
    router = object.__new__(CognitiveRouter)

    with pytest.raises(RuntimeError, match=RETIRED_PYTHON_INTELLIGENCE_ROUTER_ERROR):
        await router.route_intent("synthetic", "synthetic.py")


def test_cognitive_router_source_has_no_execution_dependencies():
    source = inspect.getsource(inspect.getmodule(CognitiveRouter))

    for forbidden in (
        "subprocess",
        "LeaseManager",
        "WildHunt",
        "SovereignHUD",
        "dev_journal",
        "resolve_project_python",
    ):
        assert forbidden not in source
