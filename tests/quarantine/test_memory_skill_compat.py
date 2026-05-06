import importlib.util
import json
import sys
from pathlib import Path

from src.core.engine.hall_schema import HallOfRecords


PROJECT_ROOT = Path(__file__).resolve().parents[2]
MEMORY_SCRIPT = PROJECT_ROOT / ".agents" / "skills" / "memory" / "scripts" / "memory.py"


def _load_memory_module(monkeypatch, tmp_path):
    monkeypatch.setenv("CORVUS_STATE_ROOT", str(tmp_path))
    module_name = "phase6_memory_skill_compat"
    sys.modules.pop(module_name, None)
    spec = importlib.util.spec_from_file_location(module_name, MEMORY_SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_memory_skill_logs_feedback_without_mutating_contract(tmp_path, monkeypatch, capsys):
    contract_path = tmp_path / ".agents" / "skills" / "demo" / "demo.feature"
    contract_path.parent.mkdir(parents=True, exist_ok=True)
    contract_path.write_text(
        "Feature: Demo Skill Behavior\n\n  Scenario: Baseline execution\n    Given the skill is triggered\n    Then it should perform its mandate\n",
        encoding="utf-8",
    )

    module = _load_memory_module(monkeypatch, tmp_path)
    observation_id = module.evolve_contract("demo", "Observed a misleading response.")

    assert contract_path.read_text(encoding="utf-8").startswith("Feature: Demo Skill Behavior")
    stderr = capsys.readouterr().err
    assert "Direct contract mutation" in stderr
    assert observation_id.startswith("memory:")

    hall = HallOfRecords(tmp_path)
    with hall.connect() as conn:
        row = conn.execute(
            "SELECT skill_id, outcome, observation, metadata_json FROM hall_skill_observations WHERE observation_id = ?",
            (observation_id,),
        ).fetchone()

    assert row is not None
    assert row["skill_id"] == "demo"
    assert row["outcome"] == "FEEDBACK_LOGGED"
    assert row["observation"] == "Observed a misleading response."

    metadata = json.loads(row["metadata_json"])
    assert metadata["contract_mutation"] == "DISABLED"
    assert metadata["target_contract"] == ".agents/skills/demo/demo.feature"
    assert metadata["canonical_promotion_path"] == "cstar evolve --action propose"
