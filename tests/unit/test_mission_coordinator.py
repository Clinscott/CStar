import pytest
import json
from pathlib import Path
from unittest.mock import MagicMock, patch

from src.sentinel.coordinator import MissionCoordinator


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
