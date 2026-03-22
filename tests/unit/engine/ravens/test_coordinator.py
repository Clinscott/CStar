import pytest
import json
from unittest.mock import MagicMock, patch
from pathlib import Path
from src.core.engine.ravens.coordinator import MissionCoordinator

@pytest.fixture
def coordinator():
    with patch("src.core.engine.ravens.coordinator.NornCoordinator"):
        return MissionCoordinator(Path("/tmp/test_root"))

def test_select_mission_from_bead(coordinator):
    mock_bead = {
        "id": "bead-123",
        "target_path": "src/file.py",
        "rationale": "Improve logic",
        "baseline_scores": {"logic": 0.8},
        "acceptance_criteria": "Code coverage > 90%"
    }
    coordinator.norn.get_next_bead.return_value = mock_bead
    
    with patch("src.core.engine.ravens.coordinator.SovereignHUD"):
        mission = coordinator.select_mission([], claim_agent="tester")
        
        assert mission["bead_id"] == "bead-123"
        assert mission["file"] == "src/file.py"
        assert mission["claimed"] is True
        assert mission["compatibility_source"] == "hall_beads"

def test_select_mission_legacy_fallback(coordinator):
    coordinator.norn.get_next_bead.return_value = None
    coordinator.norn.peek_next_bead.return_value = None
    
    ledger_data = {
        "top_targets": [
            {
                "file": "src/legacy.py",
                "priority": "HIGH",
                "metrics": {"gravity": 0.5, "logic": 0.4},
                "justification": "Legacy debt",
                "status": "TODO"
            }
        ]
    }
    
    with patch("src.core.engine.ravens.coordinator.SovereignHUD"), \
         patch.object(Path, "exists", return_value=True), \
         patch.object(Path, "read_text", return_value=json.dumps(ledger_data)):
        
        mission = coordinator.select_mission([])
        
        assert mission["file"] == "src/legacy.py"
        assert mission["severity"] == "HIGH"
        assert mission["compatibility_source"] == "legacy:tech_debt_ledger"

def test_select_mission_from_breaches(coordinator):
    coordinator.norn.get_next_bead.return_value = None
    coordinator.norn.peek_next_bead.return_value = None
    
    breaches = [
        {"severity": "LOW", "file": "low.py"},
        {"severity": "CRITICAL", "file": "crit.py"}
    ]
    
    mission = coordinator.select_mission(breaches)
    assert mission["file"] == "crit.py"

def test_initial_score_from_metrics():
    metrics = {"logic": 0.7, "style": 0.6, "overall": 0.8}
    score = MissionCoordinator._initial_score_from_metrics("LOGIC", metrics)
    assert score == 0.7
    
    score = MissionCoordinator._initial_score_from_metrics("OVERALL", metrics)
    assert score == 0.8
    
    metrics_comp = {"stability": 0.9, "coupling": 0.2, "anomaly": 0.1}
    score = MissionCoordinator._initial_score_from_metrics("STABILITY", metrics_comp)
    assert score == 9.0
    score = MissionCoordinator._initial_score_from_metrics("COUPLING", metrics_comp)
    assert score == 8.0 # (1.0 - 0.2) * 10
    score = MissionCoordinator._initial_score_from_metrics("ANOMALY", metrics_comp)
    assert score == 9.0 # (1.0 - 0.1) * 10
