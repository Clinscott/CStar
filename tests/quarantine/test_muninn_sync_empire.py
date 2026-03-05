import pytest
import os
import json
import time
from pathlib import Path
from unittest.mock import MagicMock, patch
from src.sentinel.muninn import Muninn
from src.sentinel.coordinator import MissionCoordinator

# Identity: Lead Engineer (Gungnir Matrix)
# Mandate: Empire TDD / Linscott Standard

@pytest.fixture
def mock_root(tmp_path):
    """Creates a mock project root."""
    (tmp_path / ".agent").mkdir()
    (tmp_path / ".stats").mkdir()
    return tmp_path

def test_coordinator_prioritizes_critical_ledger_missions(mock_root):
    """
    [Scenario] Raven-Ledger Synchronization
    GIVEN: A ledger with a CRITICAL and a HIGH mission.
    WHEN: Coordinator selects a mission.
    THEN: It should select the CRITICAL one.
    """
    ledger_path = mock_root / ".agent" / "tech_debt_ledger.json"
    ledger_data = {
        "top_targets": [
            {
                "file": "src/high.py",
                "priority": "HIGH",
                "justification": "High debt",
                "metrics": {"gravity": 60, "logic": 5.0}
            },
            {
                "file": "src/critical.py",
                "priority": "CRITICAL",
                "justification": "Toxic Sector",
                "metrics": {"gravity": 150, "logic": 2.0}
            }
        ]
    }
    ledger_path.write_text(json.dumps(ledger_data))
    
    coordinator = MissionCoordinator(mock_root)
    mission = coordinator.select_mission(runtime_breaches=[])
    
    assert mission["file"] == "src/critical.py"
    assert mission["severity"] == "CRITICAL"

def test_silence_protocol_blocks_flight_on_recent_activity(mock_root):
    """
    [Scenario] Silence Protocol Enforcement
    GIVEN: A recent file edit (1 minute ago).
    WHEN: Muninn checks for silence.
    THEN: It should return False (not silent).
    """
    with patch("src.sentinel.stability.TheWatcher.get_last_edit_time") as mock_edit:
        # 1 minute ago
        mock_edit.return_value = time.time() - 60
        
        m = Muninn(target_path=str(mock_root))
        assert m._is_repo_silent() is False

def test_silence_protocol_allows_flight_after_threshold(mock_root):
    """
    [Scenario] Silence Protocol Enforcement
    GIVEN: No edits for 6 minutes.
    WHEN: Muninn checks for silence.
    THEN: It should return True (silent).
    """
    with patch("src.sentinel.stability.TheWatcher.get_last_edit_time") as mock_edit:
        # 6 minutes ago
        mock_edit.return_value = time.time() - 360
        
        m = Muninn(target_path=str(mock_root))
        assert m._is_repo_silent() is True

def test_automated_breach_escalation_flags_ledger(mock_root):
    """
    [Scenario] Automated Breach Escalation
    GIVEN: A file that has failed 3 times.
    WHEN: _handle_failure is called.
    THEN: The ledger should be updated with BLOCKED_STUCK.
    """
    ledger_path = mock_root / ".agent" / "tech_debt_ledger.json"
    ledger_data = {
        "top_targets": [{"file": "toxic.py", "priority": "CRITICAL", "justification": "Messy", "metrics": {}}]
    }
    ledger_path.write_text(json.dumps(ledger_data))
    
    m = Muninn(target_path=str(mock_root))
    
    with patch.object(m.watcher, "record_failure", return_value=3), \
         patch.object(m, "_rollback"):
        
        target = {"file": "toxic.py", "severity": "CRITICAL", "action": "Fix"}
        m._handle_failure(target)
        
        # Verify Ledger
        updated_ledger = json.loads(ledger_path.read_text())
        target_entry = updated_ledger["top_targets"][0]
        assert target_entry["status"] == "BLOCKED_STUCK"
