from __future__ import annotations

import asyncio
import json
import subprocess
import sys
from pathlib import Path

import pytest

from src.core.kernel_bridge import (
    MARKER,
    RETIRED_KERNEL_BRIDGE_ERROR,
    _dispatch,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
EXPECTED_FLAGS = {
    "execution_dispatched": False,
    "hall_mutation_started": False,
    "provider_attempted": False,
    "process_started": False,
    "source_access_started": False,
}


@pytest.mark.parametrize(
    "command",
    [
        "ping",
        "shutdown",
        "PHYSICAL_MOVE_REQUEST",
        "FATAL_ROLLBACK",
        "GHOST_PULSE",
        "verify",
        "ask",
        "ROUTE_INTENT",
        "NORN_POLL",
        "unknown",
    ],
)
def test_every_legacy_command_fails_before_effects(
    command: str,
    tmp_path: Path,
) -> None:
    result = asyncio.run(
        _dispatch(
            {
                "command": command,
                "cwd": str(tmp_path),
                "args": ["source", "target"],
                "query": "synthetic-only",
            }
        )
    )
    assert result == {
        "status": "error",
        "error": RETIRED_KERNEL_BRIDGE_ERROR,
        "data": EXPECTED_FLAGS,
    }
    assert list(tmp_path.iterdir()) == []


def test_direct_executable_returns_only_retirement_evidence() -> None:
    script = PROJECT_ROOT / "src/core/kernel_bridge.py"
    result = subprocess.run(
        [sys.executable, str(script)],
        input=json.dumps(
            {
                "command": "PHYSICAL_MOVE_REQUEST",
                "args": ["source", "target"],
            }
        ),
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 1
    assert result.stderr == ""
    assert result.stdout.startswith(MARKER)
    payload = json.loads(result.stdout.removeprefix(MARKER))
    assert payload == {
        "status": "error",
        "error": RETIRED_KERNEL_BRIDGE_ERROR,
        "data": EXPECTED_FLAGS,
    }


def test_source_has_no_effectful_legacy_implementation() -> None:
    source = (PROJECT_ROOT / "src/core/kernel_bridge.py").read_text(encoding="utf-8")
    for forbidden in (
        "shutil",
        "CognitiveRouter",
        "NornCoordinator",
        "GhostWarden",
        "MuninnCrucible",
        "AntigravityUplink",
        ".move(",
        ".mkdir(",
        "complete_bead_work",
        "block_bead",
    ):
        assert forbidden not in source
