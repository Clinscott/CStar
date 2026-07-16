from __future__ import annotations

import inspect

import pytest

import src.core.mimir_client as mimir_module
from src.core.mimir_client import (
    MimirClient,
    RETIRED_PYTHON_INTELLIGENCE_ROUTER_ERROR,
)


def test_mimir_client_construction_is_inert_and_does_not_read_inputs():
    class Poison:
        def __getattribute__(self, _name):
            raise AssertionError("retired client inspected its input")

    client = MimirClient(Poison(), env=Poison(), host_session_runner=Poison())

    assert isinstance(client, MimirClient)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "args"),
    [
        ("request", ({"prompt": "synthetic"},)),
        ("think", ("synthetic",)),
        ("get_file_intent", ("synthetic.py",)),
        ("search_well", ("synthetic",)),
        ("index_sector", ("synthetic.py",)),
        ("call_tool", ("synthetic", "synthetic")),
        ("close", ()),
    ],
)
async def test_every_mimir_operation_is_terminal(method: str, args: tuple[object, ...]):
    client = MimirClient()

    with pytest.raises(RuntimeError, match=RETIRED_PYTHON_INTELLIGENCE_ROUTER_ERROR):
        await getattr(client, method)(*args)


def test_mimir_cli_is_terminal_without_provider_or_state_work(capsys):
    assert mimir_module.main() == 1
    assert capsys.readouterr().err.strip() == RETIRED_PYTHON_INTELLIGENCE_ROUTER_ERROR


def test_mimir_source_contains_no_provider_process_hall_or_sqlite_route():
    source = inspect.getsource(mimir_module)

    for forbidden in (
        "subprocess",
        "sqlite3",
        "os.environ",
        "resolve_host_provider",
        "ensure_healthy_synapse_db",
        "resolve_one_mind_decision",
        "codex exec",
    ):
        assert forbidden not in source
