from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[2]
ERROR = "legacy_hermes_daemon_retired_use_cstar_forge_or_researcher"
PYTHON_ENTRIES = (
    "run-daemons.py",
    "spoke-daemon.py",
    "nexplaynexus-one-shot.py",
    "send-task.py",
)


@pytest.mark.parametrize("name", PYTHON_ENTRIES)
def test_python_daemon_entrypoints_fail_before_effects(name: str, tmp_path: Path) -> None:
    entry = PROJECT_ROOT / "scripts/hermes-daemon" / name
    result = subprocess.run(
        [sys.executable, str(entry)],
        cwd=tmp_path,
        check=False,
        capture_output=True,
        text=True,
        env={"PATH": "/nonexistent", "HOME": str(tmp_path)},
    )
    assert result.returncode == 1
    assert result.stdout == ""
    assert result.stderr == f"{ERROR}\n"
    assert list(tmp_path.iterdir()) == []


def test_shell_daemon_entrypoint_fails_before_effects(tmp_path: Path) -> None:
    entry = PROJECT_ROOT / "scripts/hermes-daemon/spoke-daemon.sh"
    result = subprocess.run(
        ["/usr/bin/bash", str(entry), "synthetic-spoke", "synthetic-profile"],
        cwd=tmp_path,
        check=False,
        capture_output=True,
        text=True,
        env={"PATH": "/nonexistent", "HOME": str(tmp_path)},
    )
    assert result.returncode == 1
    assert result.stdout == ""
    assert result.stderr == f"{ERROR}\n"
    assert list(tmp_path.iterdir()) == []


def test_retired_sources_contain_no_secret_provider_or_daemon_primitives() -> None:
    root = PROJECT_ROOT / "scripts/hermes-daemon"
    source = "\n".join(
        (root / name).read_text(encoding="utf-8")
        for name in (*PYTHON_ENTRIES, "spoke-daemon.sh")
    )
    for forbidden in (
        "MINIMAX_API_KEY",
        ".hermes/.env",
        "MiniMax-M2.5",
        "subprocess",
        "Popen",
        "mkfifo",
        "stdin.fifo",
        "hermes --profile",
    ):
        assert forbidden not in source
