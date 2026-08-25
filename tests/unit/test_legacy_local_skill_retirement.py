"""Focused proof for retired local skill and public Hermes side channels."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

from src.skills.local.CacheBro.cache_bro import CacheBro, CacheBroDecommissioned
from src.skills.local.workflow_analyst.analyze_workflow import WorkflowAnalyst


PROJECT_ROOT = Path(__file__).resolve().parents[2]
LOCAL = PROJECT_ROOT / "src" / "skills" / "local"
HERMES_DAEMON = PROJECT_ROOT / "scripts" / "hermes-daemon"


def test_public_hermes_entrypoints_fail_closed_without_creating_state(tmp_path: Path) -> None:
    python_entrypoints = (
        "run-daemons.py",
        "send-task.py",
        "spoke-daemon.py",
        "nexplaynexus-one-shot.py",
    )
    for name in python_entrypoints:
        result = subprocess.run(
            [sys.executable, str(HERMES_DAEMON / name)],
            cwd=tmp_path,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        assert result.returncode == 2
        assert "CSTAR_PUBLIC_HERMES_DAEMON_DECOMMISSIONED" in result.stderr

    shell = subprocess.run(
        ["bash", str(HERMES_DAEMON / "spoke-daemon.sh")],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        timeout=5,
        check=False,
    )
    assert shell.returncode == 2
    assert "CSTAR_PUBLIC_HERMES_DAEMON_DECOMMISSIONED" in shell.stderr
    assert list(tmp_path.iterdir()) == []


def test_evolution_watch_and_cachebro_fail_closed_without_writes(tmp_path: Path) -> None:
    evolution = LOCAL / "CStarEvolutionWatch" / "scripts" / "evolution_watch.py"
    result = subprocess.run(
        [sys.executable, str(evolution), "--dry-run"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        timeout=5,
        check=False,
    )
    assert result.returncode == 2
    assert "CSTAR_EVOLUTION_WATCH_DECOMMISSIONED" in result.stderr

    with pytest.raises(CacheBroDecommissioned, match="decommissioned"):
        CacheBro().read_file(str(tmp_path / "secret"))
    with pytest.raises(CacheBroDecommissioned, match="decommissioned"):
        CacheBro().reset()
    assert list(tmp_path.iterdir()) == []


def test_retired_executables_contain_no_old_actuation_dependencies() -> None:
    paths = [
        LOCAL / "CStarEvolutionWatch" / "scripts" / "evolution_watch.py",
        LOCAL / "CacheBro" / "cache_bro.py",
        HERMES_DAEMON / "retired.py",
        *(HERMES_DAEMON / name for name in (
            "run-daemons.py",
            "send-task.py",
            "spoke-daemon.py",
            "nexplaynexus-one-shot.py",
        )),
    ]
    forbidden = (
        "import requests",
        "import subprocess",
        "import sqlite3",
        "SovereignBootstrap",
        "MINIMAX_API_KEY",
        "Popen(",
        "subprocess.run(",
        "write_text(",
        "mkdir(",
        "mkfifo(",
        "sqlite3.connect(",
    )
    for path in paths:
        source = path.read_text(encoding="utf-8")
        for token in forbidden:
            assert token not in source, f"{path.relative_to(PROJECT_ROOT)} contains {token}"


def test_local_instruction_files_classify_authority_and_remove_automatic_actions() -> None:
    reference_files = (
        LOCAL / "Environment" / "SKILL.qmd",
        LOCAL / "radon" / "SKILL.qmd",
    )
    retired_files = (
        LOCAL / "GitHub" / "SKILL.qmd",
        LOCAL / "skill-scout" / "SKILL.qmd",
        LOCAL / "oracle" / "SKILL.qmd",
        LOCAL / "persona-audit" / "SKILL.qmd",
        LOCAL / "CStarEvolutionWatch" / "SKILL.md",
    )
    for path in reference_files:
        assert "status: reference-only" in path.read_text(encoding="utf-8")
    for path in retired_files:
        assert "status: decommissioned" in path.read_text(encoding="utf-8")

    combined = "\n".join(path.read_text(encoding="utf-8") for path in (*reference_files, *retired_files))
    assert "git add ." not in combined
    assert "git push origin" not in combined
    assert "Just search" not in combined
    assert "Just create" not in combined
    assert "SovereignBootstrap" not in combined
    assert "persona fidelity mandate" not in combined.lower()


def test_preserved_workflow_analyzer_is_read_only(tmp_path: Path) -> None:
    tasks = tmp_path / "tasks.md"
    journal = tmp_path / "dev_journal.md"
    tasks.write_text("- [ ] bounded follow-up\n- [/] stalled item\n", encoding="utf-8")
    journal.write_text("manual fix error\n", encoding="utf-8")
    before = {path.name: path.read_bytes() for path in tmp_path.iterdir()}

    report = WorkflowAnalyst(tmp_path).analyze()

    assert report["open_loops"] == ["bounded follow-up"]
    assert report["stalled_tasks"] == ["stalled item"]
    assert {path.name: path.read_bytes() for path in tmp_path.iterdir()} == before


def test_visual_explainer_no_longer_runs_legacy_bootstrap() -> None:
    source = (LOCAL / "VisualExplainer" / "visual_explainer.py").read_text(encoding="utf-8")
    assert "SovereignBootstrap" not in source
    assert "src.core.bootstrap" not in source
