import asyncio
import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from src.core.engine.ravens_stage import RavensCycleResult, RavensHallReferenceSet, RavensStageResult, RavensTargetIdentity
from src.core.engine.validation_result import create_validation_result
from src.core.engine.ravens.muninn_heart import MuninnHeart


def test_ravens_stage_contract_serializes_nested_references() -> None:
    result = RavensCycleResult(
        status="SUCCESS",
        summary="Cycle complete.",
        mission_id="ravens-cycle:test",
        target=RavensTargetIdentity(target_path="src/core/sample.py", rationale="Repair sample path"),
        hall=RavensHallReferenceSet(repo_id="repo:test", observation_id="obs:test"),
        stages=[
            RavensStageResult(
                stage="hunt",
                status="SUCCESS",
                summary="Target selected.",
                target=RavensTargetIdentity(target_path="src/core/sample.py"),
                hall=RavensHallReferenceSet(repo_id="repo:test", observation_id="obs:hunt"),
            )
        ],
    )

    payload = result.to_dict()
    assert payload["target"]["target_path"] == "src/core/sample.py"
    assert payload["hall"]["observation_id"] == "obs:test"
    assert payload["stages"][0]["stage"] == "hunt"


def test_muninn_heart_emits_structured_cycle_result(tmp_path: Path) -> None:
    agents_dir = tmp_path / ".agents"
    agents_dir.mkdir()
    (agents_dir / "sovereign_state.json").write_text(json.dumps({}), encoding="utf-8")

    target_file = tmp_path / "src" / "target.py"
    target_file.parent.mkdir(parents=True, exist_ok=True)
    target_file.write_text("print('original')\n", encoding="utf-8")

    test_file = tmp_path / "tests" / "gauntlet" / "test_target.py"
    test_file.parent.mkdir(parents=True, exist_ok=True)
    test_file.write_text("def test_target():\n    assert True\n", encoding="utf-8")

    heart = MuninnHeart(tmp_path, MagicMock())
    heart._run_behavioral_pulse = AsyncMock()
    heart._wait_for_silence = MagicMock()
    heart.coordinator.select_mission = MagicMock(
        return_value={
            "mission_id": "mission:test",
            "file": "src/target.py",
            "action": "Repair target path",
            "severity": "HIGH",
            "metrics": {"overall": 1.0},
        }
    )
    heart.crucible.generate_gauntlet = AsyncMock(return_value=test_file)
    heart.crucible.generate_steel = AsyncMock(return_value="print('fixed')\n")
    heart.crucible.verify_fix_result = MagicMock(
        return_value=create_validation_result(
            before={"overall": 1.0},
            after={"overall": 2.0},
            summary="Candidate accepted.",
        )
    )
    heart.watcher.record_edit = MagicMock(return_value=True)
    heart.watcher.record_failure = MagicMock()
    heart.memory.record_trace = MagicMock()

    result = asyncio.run(heart.execute_cycle_contract())

    assert result.status == "SUCCESS"
    assert [stage.stage for stage in result.stages] == ["memory", "hunt", "validate", "promote"]
    assert result.target is not None
    assert result.target.target_path == "src/target.py"
    assert result.stages[2].hall is not None
    assert result.stages[2].hall.validation_id is not None
    assert result.stages[3].status == "SUCCESS"


def test_muninn_heart_wait_for_silence_requires_stable_repository_snapshot(tmp_path: Path, monkeypatch) -> None:
    heart = MuninnHeart(tmp_path, MagicMock())
    monkeypatch.setenv("MUNINN_SILENCE_INTERVAL", "0")
    monkeypatch.setenv("MUNINN_SILENCE_ATTEMPTS", "2")

    with patch.object(heart, "_repository_activity_snapshot", side_effect=[" M file.py\n", " M file.py\n"]) as snapshot, \
         patch("src.core.engine.ravens.muninn_heart.time.sleep") as sleep:
        heart._wait_for_silence()

    assert snapshot.call_count == 2
    sleep.assert_called_once_with(0.0)


def test_muninn_heart_wait_for_silence_fails_when_repository_keeps_changing(tmp_path: Path, monkeypatch) -> None:
    heart = MuninnHeart(tmp_path, MagicMock())
    monkeypatch.setenv("MUNINN_SILENCE_INTERVAL", "0")
    monkeypatch.setenv("MUNINN_SILENCE_ATTEMPTS", "2")

    with patch.object(heart, "_repository_activity_snapshot", side_effect=["1", "2", "3"]), \
         patch("src.core.engine.ravens.muninn_heart.time.sleep"):
        try:
            heart._wait_for_silence()
        except RuntimeError as exc:
            assert "did not settle" in str(exc)
        else:
            raise AssertionError("Expected unsettled repository activity to block flight.")
