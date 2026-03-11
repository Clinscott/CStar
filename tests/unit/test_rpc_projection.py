import json

from src.core.engine.bead_ledger import BeadLedger
from src.core.engine.hall_schema import HallFileRecord, HallOfRecords, HallScanRecord, HallValidationRun
from src.cstar.core.rpc import SovereignRPC


def seed_hall(root):
    agents_dir = root / ".agents"
    agents_dir.mkdir()
    (agents_dir / "sovereign_state.json").write_text(json.dumps({}), encoding="utf-8")

    hall = HallOfRecords(root)
    repo = hall.bootstrap_repository()
    hall.record_scan(
        HallScanRecord(
            scan_id="scan-rpc-1",
            repo_id=repo.repo_id,
            scan_kind="rpc_projection",
            status="COMPLETED",
            baseline_gungnir_score=7.1,
            started_at=1700000000000,
            completed_at=1700000000100,
            metadata={},
        )
    )
    hall.record_file(
        HallFileRecord(
            repo_id=repo.repo_id,
            scan_id="scan-rpc-1",
            path="src/core/vector.py",
            gungnir_score=3.3,
            created_at=1700000000200,
        )
    )
    hall.save_validation_run(
        HallValidationRun(
            validation_id="validation-rpc-1",
            repo_id=repo.repo_id,
            scan_id="scan-rpc-1",
            target_path="src/core/vector.py",
            verdict="SUCCESS",
            pre_scores={"overall": 3.3},
            post_scores={"overall": 7.9},
            benchmark={"target_metric": "LOGIC"},
            notes="Raised logic stability",
            created_at=1700000000300,
        )
    )

    ledger = BeadLedger(root)
    ledger.upsert_bead(
        target_path="src/core/vector.py",
        rationale="Stabilize the vector layer",
        contract_refs=["contracts:vector-layer"],
        acceptance_criteria="Raise overall above 7.0.",
    )


def test_sovereign_rpc_projects_recent_traces_and_tasks_from_hall(tmp_path):
    seed_hall(tmp_path)
    (tmp_path / "tasks.qmd").write_text("- [ ] stale markdown authority\n", encoding="utf-8")

    rpc = SovereignRPC(tmp_path)
    traces = rpc.get_recent_traces()
    dashboard = rpc.get_dashboard_state()

    assert len(traces) == 1
    assert traces[0]["mission_id"] == "scan-rpc-1"
    assert traces[0]["file_path"] == "src/core/vector.py"
    assert traces[0]["target_metric"] == "LOGIC"
    assert traces[0]["initial_score"] == 3.3
    assert traces[0]["final_score"] == 7.9
    assert traces[0]["justification"] == "Raised logic stability"
    assert traces[0]["status"] == "SUCCESS"

    assert len(dashboard["tasks"]) == 1
    assert "Stabilize the vector layer" in dashboard["tasks"][0]
    assert "src/core/vector.py" in dashboard["tasks"][0]
