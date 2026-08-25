from __future__ import annotations

import asyncio
import ast
import inspect
from pathlib import Path

import pytest

from src.core.engine.ravens import (
    coordinator,
    git_spoke,
    muninn,
    muninn_crucible,
    muninn_heart,
    muninn_hunter,
    muninn_memory,
    muninn_promotion,
    ravens_runtime,
    repo_spoke,
    score_cohesion,
    stability,
)
from src.core.engine.ravens.retired import (
    RAVENS_DECOMMISSIONED_CODE,
    RavensExecutionDecommissioned,
)

RETIRED_MODULES = (
    coordinator,
    git_spoke,
    muninn,
    muninn_crucible,
    muninn_heart,
    muninn_hunter,
    muninn_memory,
    muninn_promotion,
    ravens_runtime,
    repo_spoke,
    score_cohesion,
    stability,
)

FORBIDDEN_IMPORT_ROOTS = {
    "requests",
    "shutil",
    "subprocess",
    "src.core.engine.hall_schema",
    "src.core.norn_coordinator",
    "src.core.sovereign_hud",
    "src.cstar.core.uplink",
}

FORBIDDEN_SOURCE_TOKENS = (
    "AntigravityUplink",
    "HallOfRecords",
    "NornCoordinator",
    "SovereignHUD",
    ".mkdir(",
    ".read_text(",
    ".write_text(",
    "save_validation_result",
    "send_payload",
)


def _import_names(module: object) -> set[str]:
    tree = ast.parse(inspect.getsource(module))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
    return names


def test_retired_modules_have_no_actuation_imports_or_calls() -> None:
    for module in RETIRED_MODULES:
        source = inspect.getsource(module)
        imports = _import_names(module)
        assert imports.isdisjoint(FORBIDDEN_IMPORT_ROOTS), module.__name__
        for token in FORBIDDEN_SOURCE_TOKENS:
            assert token not in source, f"{module.__name__}: {token}"


def test_constructors_are_non_mutating_and_old_operations_share_one_error(tmp_path: Path) -> None:
    target = tmp_path / "untouched"
    before = list(tmp_path.rglob("*"))

    mission = coordinator.MissionCoordinator(target)
    git = git_spoke.GitSpoke(target)
    raven = muninn.Muninn(str(target))
    crucible = muninn_crucible.MuninnCrucible(target, object())
    heart = muninn_heart.MuninnHeart(target, object())
    hunter = muninn_hunter.MuninnHunter(target, object())
    memory = muninn_memory.MuninnMemory(target)
    promotion = muninn_promotion.MuninnPromotion(target)
    repo = repo_spoke.RepoSpoke(target, "compatibility")
    scorer = score_cohesion.CohesionScorer()
    watcher = stability.TheWatcher(target)

    after = list(tmp_path.rglob("*"))
    assert after == before

    operations = (
        lambda: mission.select_mission([]),
        git.is_clean,
        lambda: crucible.apply_fix(target / "candidate.py", "content"),
        memory.load_ledger,
        lambda: promotion.execute_promotion_stage(),
        lambda: scorer.lexical_score("generated", "reference"),
        lambda: watcher.record_edit("candidate.py", "content"),
    )
    for operation in operations:
        with pytest.raises(RavensExecutionDecommissioned) as error:
            operation()
        assert error.value.code == RAVENS_DECOMMISSIONED_CODE

    async def async_rejections() -> None:
        for operation in (
            raven.run_cycle,
            heart.execute_cycle,
            hunter.execute_hunt,
            lambda: repo.process(lambda: None),
        ):
            with pytest.raises(RavensExecutionDecommissioned) as error:
                await operation()
            assert error.value.code == RAVENS_DECOMMISSIONED_CODE

    asyncio.run(async_rejections())
    assert list(tmp_path.rglob("*")) == before


def test_structured_contracts_reject_without_invoking_uplink(tmp_path: Path) -> None:
    class ExplodingUplink:
        def __getattr__(self, name: str):
            raise AssertionError(f"uplink accessed: {name}")

    heart = muninn_heart.MuninnHeart(tmp_path, ExplodingUplink())
    heart_result = asyncio.run(heart.execute_cycle_contract())
    runtime_result = asyncio.run(
        ravens_runtime.execute_ravens_cycle_contract(tmp_path, uplink=ExplodingUplink())
    )

    for result in (heart_result, runtime_result):
        assert result.status == "FAILURE"
        assert result.metadata["execution_attempted"] is False
        assert result.metadata["error_code"] == RAVENS_DECOMMISSIONED_CODE
