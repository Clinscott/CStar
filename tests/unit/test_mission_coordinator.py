import pytest
import json
from pathlib import Path

from src.core.engine.hall_schema import HallFileRecord, HallOfRecords, HallScanRecord
from src.core.norn_coordinator import NornCoordinator

from src.core.engine.ravens.coordinator import MissionCoordinator


@pytest.fixture
def coordinator(tmp_path):
    root = tmp_path
    agent_dir = root / ".agents"
    agent_dir.mkdir()
    return MissionCoordinator(root)


def test_select_mission_with_target_metrics(coordinator, tmp_path):
    ledger_path = tmp_path / ".agents" / "tech_debt_ledger.json"
    
    # Mock ledger data with target_metrics
    ledger_data = {
        "timestamp": "2026-03-03T12:00:00Z",
        "top_targets": [
            {
                "file": "src/core/test1.py",
                "priority": "HIGH",
                "target_metric": "STYLE",
                "justification": "Style dissonance",
                "metrics": {"gravity": 60, "logic": 6.5, "style": 4.0, "intel": 8.0, "stability": 0.8, "coupling": 0.2, "anomaly": 0.1}
            },
            {
                "file": "src/core/test2.py",
                "priority": "CRITICAL",
                "target_metric": "LOGIC",
                "justification": "Logic failure",
                "metrics": {"gravity": 120, "logic": 3.0, "style": 9.0, "intel": 9.0, "stability": 0.9, "coupling": 0.1, "anomaly": 0.0}
            },
            {
                "file": "src/core/test3.py",
                "priority": "HIGH",
                "target_metric": "STABILITY",
                "justification": "Instability",
                "metrics": {"gravity": 70, "logic": 8.0, "style": 8.0, "intel": 8.0, "stability": 0.3, "coupling": 0.4, "anomaly": 0.2}
            }
        ]
    }
    ledger_path.write_text(json.dumps(ledger_data))

    mission = coordinator.select_mission([])
    
    # CRITICAL should be picked first
    assert mission["file"] == "src/core/test2.py"
    assert mission["target_metric"] == "LOGIC"
    assert mission["initial_score"] == 3.0
    
    # Change test2 to BLOCKED_STUCK to test fallback
    ledger_data["top_targets"][1]["status"] = "BLOCKED_STUCK"
    ledger_path.write_text(json.dumps(ledger_data))
    
    mission2 = coordinator.select_mission([])
    # HIGH priority, gravity 70 > 60, so test3 should be picked
    assert mission2["file"] == "src/core/test3.py"
    assert mission2["target_metric"] == "STABILITY"
    assert mission2["initial_score"] == 3.0 # (0.3 stability * 10)


def test_select_mission_fallback_legacy(coordinator, tmp_path):
    # No ledger file exists
    runtime_breaches = [{"severity": "HIGH", "file": "legacy.py"}]
    mission = coordinator.select_mission(runtime_breaches)
    assert mission["file"] == "legacy.py"


def test_select_mission_prefers_hall_beads_over_legacy_projection(tmp_path):
    agents_dir = tmp_path / ".agents"
    agents_dir.mkdir()
    (agents_dir / "sovereign_state.json").write_text(json.dumps({}), encoding="utf-8")
    (agents_dir / "tech_debt_ledger.json").write_text(
        json.dumps(
            {
                "top_targets": [
                    {
                        "file": "src/core/legacy.py",
                        "priority": "CRITICAL",
                        "target_metric": "LOGIC",
                        "justification": "Legacy projection should not win.",
                        "metrics": {"gravity": 999, "logic": 0.1},
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    hall = HallOfRecords(tmp_path)
    repo = hall.bootstrap_repository()
    hall.record_scan(
        HallScanRecord(
            scan_id="scan-hunt-1",
            repo_id=repo.repo_id,
            scan_kind="hunt",
            status="COMPLETED",
            baseline_gungnir_score=4.2,
            started_at=1700000000000,
            completed_at=1700000000100,
            metadata={},
        )
    )
    hall.record_file(
        HallFileRecord(
            repo_id=repo.repo_id,
            scan_id="scan-hunt-1",
            path="src/core/bead_target.py",
            gungnir_score=2.2,
            created_at=1700000000200,
        )
    )
    NornCoordinator(tmp_path).ledger.upsert_bead(
        scan_id="scan-hunt-1",
        target_path="src/core/bead_target.py",
        rationale="Canonical bead should win.",
        contract_refs=["contracts:bead-target"],
        acceptance_criteria="Raise the baseline above 5.0.",
    )

    mission = MissionCoordinator(tmp_path).select_mission([])

    assert mission is not None
    assert mission["file"] == "src/core/bead_target.py"
    assert mission["bead_id"].startswith("bead:")
    assert mission["compatibility_source"] == "hall_beads"
