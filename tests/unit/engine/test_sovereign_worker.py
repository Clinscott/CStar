from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

from src.core.engine.sovereign_worker import (
    CStarBridge,
    RETIRED_SOVEREIGN_WORKER_ERROR,
    SovereignWorker,
)


@pytest.fixture
def worker(tmp_path: Path) -> SovereignWorker:
    return SovereignWorker(tmp_path)


@pytest.mark.parametrize(
    "name,args",
    [
        ("run_shell_command", {"command": "touch forbidden"}),
        ("read_file", {"path": "forbidden"}),
        ("write_file", {"path": "forbidden", "content": "forbidden"}),
        ("list_directory", {"path": "."}),
        ("unknown", {}),
    ],
)
def test_retired_bridge_rejects_every_tool_before_effects(
    tmp_path: Path,
    name: str,
    args: dict[str, str],
) -> None:
    with pytest.raises(RuntimeError, match=f"^{RETIRED_SOVEREIGN_WORKER_ERROR}$"):
        CStarBridge(tmp_path).execute_tool(name, args)
    assert list(tmp_path.iterdir()) == []


def test_retired_worker_rejects_provider_loop_before_effects(
    worker: SovereignWorker,
    tmp_path: Path,
) -> None:
    with pytest.raises(RuntimeError, match=f"^{RETIRED_SOVEREIGN_WORKER_ERROR}$"):
        worker.run("system", "write forbidden")
    with pytest.raises(RuntimeError, match=f"^{RETIRED_SOVEREIGN_WORKER_ERROR}$"):
        worker._call_llm()
    assert worker.messages == []
    assert list(tmp_path.iterdir()) == []


def test_legacy_xml_parser_is_deterministic_and_effect_free(
    worker: SovereignWorker,
    tmp_path: Path,
) -> None:
    calls = worker._parse_tool_calls(
        """
        <invoke name='read_file'><path>test.txt</path></invoke>
        <invoke name='run_shell_command'>
          <arg_name>command</arg_name><arg_value>echo hello</arg_value>
        </invoke>
        """
    )
    assert calls == [
        ("read_file", {"path": "test.txt"}),
        ("run_shell_command", {"command": "echo hello"}),
    ]
    assert list(tmp_path.iterdir()) == []


def test_direct_executable_is_a_retirement_tombstone() -> None:
    script = Path(__file__).resolve().parents[3] / "src/core/engine/sovereign_worker.py"
    result = subprocess.run(
        [sys.executable, str(script)],
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 1
    assert result.stdout == ""
    assert result.stderr == f"{RETIRED_SOVEREIGN_WORKER_ERROR}\n"


def test_source_has_no_provider_shell_or_filesystem_execution() -> None:
    source = (
        Path(__file__).resolve().parents[3]
        / "src/core/engine/sovereign_worker.py"
    ).read_text(encoding="utf-8")
    for forbidden in (
        "requests.post",
        "subprocess.run",
        "shell=True",
        ".write_text(",
        ".read_text(",
        ".mkdir(",
        ".iterdir(",
    ):
        assert forbidden not in source
