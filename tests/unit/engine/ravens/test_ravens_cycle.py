import inspect
import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from src.core.engine.ravens import ravens_cycle


def test_ravens_cycle_main_fails_closed_without_execution() -> None:
    with (
        patch("argparse.ArgumentParser.parse_args", return_value=SimpleNamespace(project_root="/tmp/untrusted")),
        patch("builtins.print") as mock_print,
        pytest.raises(SystemExit) as exit_info,
    ):
        ravens_cycle.main()

    assert exit_info.value.code == 2
    mock_print.assert_called_once()
    payload = json.loads(mock_print.call_args.args[0])
    assert payload["status"] == "FAILURE"
    assert payload["metadata"] == {
        "adapter": "compatibility:ravens-cycle-rejected",
        "requested_project_root": "/tmp/untrusted",
        "decommissioned": True,
        "read_only": True,
        "execution_attempted": False,
    }


def test_ravens_cycle_entrypoint_has_no_runner_or_mutation_imports() -> None:
    source = inspect.getsource(ravens_cycle)

    forbidden = (
        "asyncio",
        "subprocess",
        "execute_ravens_cycle_contract",
        "MuninnHeart",
        "write_text",
        "commit_changes",
        "checkout",
    )
    for token in forbidden:
        assert token not in source
