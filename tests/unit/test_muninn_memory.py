import json
from pathlib import Path

from src.core.engine.hall_schema import HallOfRecords
from src.sentinel.muninn_memory import MuninnMemory


def test_record_trace_writes_hall_observation_and_compatibility_trace(tmp_path: Path) -> None:
    agents_dir = tmp_path / ".agents"
    agents_dir.mkdir()
    (agents_dir / "sovereign_state.json").write_text(json.dumps({}), encoding="utf-8")

    memory = MuninnMemory(tmp_path)
    observation_id = memory.record_trace("mission:test", "src/core/sample.py", "fix", 1.2, "SUCCESS")

    trace_files = list((tmp_path / ".agents" / "traces").glob("trace_mission_test_*.json"))
    assert len(trace_files) == 1

    trace_payload = json.loads(trace_files[0].read_text(encoding="utf-8"))
    assert trace_payload["source"] == "compatibility_projection"
    assert trace_payload["observation_id"] == observation_id

    with HallOfRecords(tmp_path).connect() as conn:
        row = conn.execute(
            "SELECT skill_id, outcome FROM hall_skill_observations WHERE observation_id = ?",
            (observation_id,),
        ).fetchone()

    assert row["skill_id"] == "ravens:trace"
    assert row["outcome"] == "SUCCESS"


def test_sync_intent_integrity_from_sprt_updates_hall_first(tmp_path: Path) -> None:
    agents_dir = tmp_path / ".agents"
    agents_dir.mkdir()
    (agents_dir / "sovereign_state.json").write_text(json.dumps({"framework": {}}), encoding="utf-8")
    (agents_dir / "sprt_ledger.json").write_text(
        json.dumps({"history": [{"accuracy": 87.5}]}),
        encoding="utf-8",
    )

    memory = MuninnMemory(tmp_path)
    accuracy = memory.sync_intent_integrity_from_sprt()

    assert accuracy == 87.5

    repo = HallOfRecords(tmp_path).get_repository_record()
    assert repo is not None
    assert repo.intent_integrity == 87.5

    state = json.loads((agents_dir / "sovereign_state.json").read_text(encoding="utf-8"))
    assert state["framework"]["intent_integrity"] == 87.5
