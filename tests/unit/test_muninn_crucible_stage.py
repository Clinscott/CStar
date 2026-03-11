import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

from src.core.engine.hall_schema import HallOfRecords
from src.core.engine.validation_result import create_validation_result
from src.sentinel.muninn_crucible import MuninnCrucible
from src.sentinel.muninn_memory import MuninnMemory


def test_execute_validation_stage_returns_hall_backed_stage_result(tmp_path: Path) -> None:
    agents_dir = tmp_path / ".agents"
    agents_dir.mkdir()
    (agents_dir / "sovereign_state.json").write_text(json.dumps({}), encoding="utf-8")

    target_file = tmp_path / "src" / "target.py"
    target_file.parent.mkdir(parents=True, exist_ok=True)
    target_file.write_text("print('original')\n", encoding="utf-8")

    test_file = tmp_path / "tests" / "gauntlet" / "test_target.py"
    test_file.parent.mkdir(parents=True, exist_ok=True)
    test_file.write_text("def test_target():\n    assert True\n", encoding="utf-8")

    memory = MuninnMemory(tmp_path)
    crucible = MuninnCrucible(tmp_path, MagicMock())
    crucible.generate_gauntlet = AsyncMock(return_value=test_file)
    crucible.generate_steel = AsyncMock(return_value="print('fixed')\n")
    crucible.verify_fix_result = MagicMock(
        return_value=create_validation_result(
            before={"overall": 1.0},
            after={"overall": 2.0},
            summary="Candidate accepted.",
        )
    )

    stage = __import__("asyncio").run(
        crucible.execute_validation_stage(
            memory.repo_id(),
            {
                "mission_id": "mission:test",
                "bead_id": "bead:test",
                "file": "src/target.py",
                "action": "Repair target path",
                "metrics": {"overall": 1.0},
            },
            memory.record_stage_observation,
        )
    )

    assert stage.stage == "validate"
    assert stage.status == "SUCCESS"
    assert stage.hall is not None
    assert stage.hall.validation_id is not None
    assert stage.metadata["candidate_applied"] is True

    with HallOfRecords(tmp_path).connect() as conn:
        validation_count = conn.execute("SELECT COUNT(*) AS count FROM hall_validation_runs").fetchone()["count"]
        validation_row = conn.execute(
            "SELECT bead_id, scan_id FROM hall_validation_runs LIMIT 1"
        ).fetchone()
        observation_count = conn.execute(
            "SELECT COUNT(*) AS count FROM hall_skill_observations WHERE skill_id = 'ravens:validate'"
        ).fetchone()["count"]

    assert validation_count == 1
    assert validation_row["bead_id"] == "bead:test"
    assert validation_row["scan_id"] is None
    assert observation_count == 1


def test_execute_validation_stage_consumes_forge_validation_handoff(tmp_path: Path) -> None:
    agents_dir = tmp_path / ".agents"
    agents_dir.mkdir()
    (agents_dir / "sovereign_state.json").write_text(json.dumps({}), encoding="utf-8")

    target_file = tmp_path / "src" / "target.py"
    target_file.parent.mkdir(parents=True, exist_ok=True)
    target_file.write_text("print('original')\n", encoding="utf-8")

    staged_candidate = tmp_path / ".agents" / "forge_staged" / "candidate_target.py"
    staged_candidate.parent.mkdir(parents=True, exist_ok=True)
    staged_candidate.write_text("print('staged')\n", encoding="utf-8")

    test_file = tmp_path / "tests" / "gauntlet" / "test_target.py"
    test_file.parent.mkdir(parents=True, exist_ok=True)
    test_file.write_text("def test_target():\n    assert True\n", encoding="utf-8")

    memory = MuninnMemory(tmp_path)
    crucible = MuninnCrucible(tmp_path, MagicMock())
    crucible.generate_gauntlet = AsyncMock()
    crucible.generate_steel = AsyncMock()
    crucible.verify_fix_result = MagicMock(
        return_value=create_validation_result(
            before={"overall": 1.0},
            after={"overall": 2.4},
            summary="Forge handoff accepted.",
        )
    )

    stage = __import__("asyncio").run(
        crucible.execute_validation_stage(
            memory.repo_id(),
            {
                "mission_id": "mission:forge",
                "validation_request": {
                    "bead_id": "bead:forge",
                    "candidate_id": "candidate:forge",
                    "repo_id": memory.repo_id(),
                    "scan_id": "scan:forge",
                    "target_path": "src/target.py",
                    "staged_path": str(staged_candidate),
                    "contract_refs": ["contracts:target"],
                    "acceptance_criteria": "Raise the baseline above 2.0.",
                    "required_validations": ["crucible", "generated_tests"],
                    "baseline_scores": {"overall": 1.0},
                    "generated_tests": [
                        {
                            "path": "tests/gauntlet/test_target.py",
                            "reason": "Regression gauntlet",
                            "contract_refs": ["contracts:target"],
                            "template": "gauntlet",
                        }
                    ],
                },
            },
            memory.record_stage_observation,
        )
    )

    assert stage.status == "SUCCESS"
    assert stage.target is not None
    assert stage.target.target_path == "src/target.py"
    assert stage.metadata["candidate_source"] == "staged_candidate"
    assert stage.metadata["staged_candidate_path"] == str(staged_candidate)
    assert stage.metadata["required_validations"] == ["crucible", "generated_tests"]
    assert stage.metadata["contract_refs"] == ["contracts:target"]
    assert stage.metadata["generated_tests"][0]["path"] == "tests/gauntlet/test_target.py"
    assert target_file.read_text(encoding="utf-8") == "print('staged')\n"
    crucible.generate_gauntlet.assert_not_called()
    crucible.generate_steel.assert_not_called()
