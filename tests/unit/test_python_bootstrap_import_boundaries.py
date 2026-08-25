from __future__ import annotations

import asyncio
import os
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]

PASSIVE_MODULES = (
    "src.games.odin_protocol.engine.adjudicator",
    "src.games.odin_protocol.engine.logic",
    "src.skills.local.SkillLearning.learn",
    "src.skills.local.CacheBro.cache_bro",
    "src.core.engine.diagnostic.harvest_responses",
    "src.skills.local.KnowledgeHunter.hunter",
    "src.skills.local.VisualExplainer.visual_explainer",
    "src.skills.local.WildHunt.wild_hunt",
)


@pytest.mark.parametrize("module_name", PASSIVE_MODULES)
def test_module_import_does_not_execute_sovereign_bootstrap(module_name: str) -> None:
    script = f"""
import builtins
import importlib
import sys

real_import = builtins.__import__
def guarded_import(name, *args, **kwargs):
    if name.split('.', 1)[0] == 'dotenv':
        raise ModuleNotFoundError(name)
    return real_import(name, *args, **kwargs)
builtins.__import__ = guarded_import
sys.path.insert(0, {str(ROOT)!r})

from src.core import bootstrap
assert bootstrap._BOOTSTRAPPED is False
def reject_bootstrap():
    raise AssertionError('bootstrap_executed_during_import')
bootstrap.SovereignBootstrap.execute = staticmethod(reject_bootstrap)

importlib.import_module({module_name!r})
assert bootstrap._BOOTSTRAPPED is False
"""
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT)
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr


def test_harvester_fails_closed_without_bootstrap_provider_or_write(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.core.engine.diagnostic import harvest_responses

    monkeypatch.chdir(tmp_path)
    with pytest.raises(
        RuntimeError,
        match=f"^{harvest_responses.RETIRED_PYTHON_SOURCE_TOOL_ERROR}$",
    ):
        asyncio.run(harvest_responses.Harvester.execute(cycles=0))

    assert list(tmp_path.rglob("*")) == []


def test_knowledge_hunter_fails_closed_without_bootstrap(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    from src.skills.local.KnowledgeHunter import hunter

    monkeypatch.chdir(tmp_path)
    instance = hunter.KnowledgeHunter()
    with pytest.raises(
        RuntimeError,
        match=f"^{hunter.RETIRED_PYTHON_SOURCE_TOOL_ERROR}$",
    ):
        asyncio.run(instance.hunt("synthetic topic"))

    assert hunter.main() == 1
    assert capsys.readouterr().err == f"{hunter.RETIRED_PYTHON_SOURCE_TOOL_ERROR}\n"
    assert list(tmp_path.rglob("*")) == []


def test_retired_skill_learning_fails_closed_without_imports_or_writes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    from src.skills.local.SkillLearning.learn import (
        RETIRED_ERROR,
        SkillLearner,
        main,
    )

    monkeypatch.chdir(tmp_path)

    with pytest.raises(RuntimeError, match=f"^{RETIRED_ERROR}$"):
        SkillLearner.execute()

    assert main() == 1
    assert capsys.readouterr().err == f"{RETIRED_ERROR}\n"
    assert list(tmp_path.rglob("*")) == []


def test_retired_skill_learning_doc_points_to_durable_forge() -> None:
    from src.skills.local.SkillLearning.learn import RETIRED_ERROR

    skill_root = ROOT / "src" / "skills" / "local" / "SkillLearning"
    source = (skill_root / "learn.py").read_text(encoding="utf-8")
    documentation = (skill_root / "SKILL.qmd").read_text(encoding="utf-8")

    assert "src.skills.local.SkillHunter" not in source
    assert "SovereignBootstrap" not in source
    assert RETIRED_ERROR in documentation
    assert "cstar_forge_request -> cstar_forge_execute" in documentation
    assert "Run `python" not in documentation
