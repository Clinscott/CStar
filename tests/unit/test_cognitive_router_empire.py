"""Regression tests for the retired Python CognitiveRouter."""

from __future__ import annotations

from pathlib import Path

import pytest

from src.core.engine.cognitive_router import CognitiveRouter


@pytest.mark.asyncio
async def test_route_intent_is_advisory_lane_tombstone(tmp_path: Path) -> None:
    result = await CognitiveRouter(tmp_path).route_intent(
        "implement a change",
        "src/target.py",
        loki_mode=True,
    )

    assert result["status"] == "error"
    assert result["error_code"] == "cognitive_router_decommissioned"
    assert result["execution_attempted"] is False
    assert result["learning_write_attempted"] is False
    assert not (tmp_path / "dev_journal.qmd").exists()


@pytest.mark.asyncio
async def test_execute_forge_cannot_synthesize_success(tmp_path: Path) -> None:
    result = await CognitiveRouter(tmp_path)._execute_forge("goal", [], [], [])

    assert result == {
        "status": "error",
        "error_code": "forge_lifecycle_required",
        "message": result["message"],
        "execution_attempted": False,
    }
    assert "cstar_forge_request" in str(result["message"])


@pytest.mark.asyncio
async def test_learning_session_is_side_effect_free(tmp_path: Path) -> None:
    router = CognitiveRouter(tmp_path)
    assert await router._run_learning_session("goal", ["target"], "SUCCESS", "context") is None
    assert list(tmp_path.iterdir()) == []
