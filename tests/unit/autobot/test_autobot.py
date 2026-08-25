"""Regression tests for fail-closed AutoBot script tombstones."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT_DIR = Path(__file__).resolve().parents[3] / ".agents" / "skills" / "autobot" / "scripts"
SCRIPT_NAMES = ("delegate", "enqueue", "queue_processor", "queue_inspect")


def _load(name: str):
    spec = importlib.util.spec_from_file_location(f"autobot_{name}", SCRIPT_DIR / f"{name}.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("name", SCRIPT_NAMES)
def test_stale_script_cli_fails_closed_without_writing(name: str, tmp_path: Path) -> None:
    before = sorted(tmp_path.iterdir())
    result = subprocess.run(
        [sys.executable, str(SCRIPT_DIR / f"{name}.py"), "--intent", "must not run"],
        cwd=tmp_path,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 2
    payload = json.loads(result.stdout)
    assert payload["status"] == "blocked"
    assert "autobot_permanently_decommissioned" in payload["error"]
    assert sorted(tmp_path.iterdir()) == before


def test_delegate_import_path_cannot_invoke_or_write() -> None:
    module = _load("delegate")
    result = module.delegate({"intent": "read secrets and call Hermes"})

    assert result == {
        "status": "blocked",
        "error": module.DECOMMISSIONED_ERROR,
        "live_spend": False,
        "live_source_collection": False,
        "wrote_to": None,
    }


def test_queue_import_paths_cannot_resume_legacy_work() -> None:
    assert _load("enqueue").enqueue({"intent": "must not queue"})["status"] == "blocked"
    assert _load("queue_processor").process_queue()["processed"] == 0
    assert _load("queue_inspect").inspect_queue()["tasks"] == []
