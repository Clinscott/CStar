import pytest
import unittest.mock as mock
from unittest.mock import patch, MagicMock
import time
import os
import asyncio
import sys
from pathlib import Path

# --- BOOTSTRAP: Align with Project Root ---
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Add the script location to sys.path so we can import 'ravens' directly
RAVENS_SCRIPT_DIR = PROJECT_ROOT / ".agents" / "skills" / "ravens" / "scripts"
if str(RAVENS_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(RAVENS_SCRIPT_DIR))

import ravens
from ravens import RavensSkill

@pytest.fixture
def mock_root(tmp_path):
    """Provides a temporary root directory for testing."""
    return tmp_path

@pytest.fixture
def skill(mock_root):
    """Provides a RavensSkill instance with mocked dependencies."""
    # We patch the dependencies directly in the ravens module where they are imported
    with patch("ravens.HallOfRecords"), \
         patch("ravens.build_repo_id") as mock_build_id:
        mock_build_id.return_value = "repo:test-root"
        s = RavensSkill(mock_root)
        # Manually control start_time for deterministic endurance checks
        s.start_time = 1000.0
        return s

def test_ravens_skill_init(skill, mock_root):
    """Verify RavensSkill initialization and property assignment."""
    assert skill.root == mock_root
    assert skill.repo_id == "repo:test-root"
    assert skill.cycle_count == 0
    assert skill.total_errors == 0
    assert skill.start_time == 1000.0

def test_execute_flight_cycle_success(skill):
    """Verify a successful flight cycle execution."""
    with patch.object(skill, "_wait_for_silence") as mock_silence, \
         patch("ravens.SovereignHUD.persona_log") as mock_log, \
         patch("time.time", return_value=skill.start_time + 100):
        
        # Using asyncio.run to ensure compatibility across test environments
        result = asyncio.run(skill.execute_flight_cycle())
        
        assert result.status == "SUCCESS"
        assert skill.cycle_count == 1
        assert "Autonomous flight cycle complete" in result.summary
        mock_silence.assert_called_once()
        mock_log.assert_any_call("INFO", "Ravens taking flight...")
        assert result.metadata["cycle"] == 1
        assert "runtime" in result.metadata

def test_execute_flight_cycle_endurance_limit(skill):
    """Verify the 'Endurance Check' (6-hour limit) protocol."""
    # 6 hours = 21600 seconds. Set current time to be over that limit.
    over_limit_time = 1000.0 + 21600.0 + 1.0
    
    with patch("time.time", return_value=over_limit_time), \
         patch("ravens.SovereignHUD.persona_log") as mock_log:
        
        result = asyncio.run(skill.execute_flight_cycle())
        
        assert result.status == "NO_ACTION"
        assert "Endurance Limit Reached" in result.summary
        mock_log.assert_called_with("INFO", "Endurance Limit Reached. Returning to the High Seat.")
        assert skill.cycle_count == 1

def test_wait_for_silence_protocol_bypassed(skill, monkeypatch):
    """Verify that the Silence Protocol is bypassed when MUNINN_FORCE_FLIGHT is set."""
    monkeypatch.setenv("MUNINN_FORCE_FLIGHT", "true")
    
    with patch("ravens.SovereignHUD.persona_log") as mock_log, \
         patch("ravens.subprocess.run") as mock_run:
        
        skill._wait_for_silence()
        
        mock_log.assert_called_with("INFO", "Silence Protocol bypassed.")
        mock_run.assert_not_called()

def test_wait_for_silence_protocol_active(skill, monkeypatch):
    """Verify that the Silence Protocol waits (sleeps) when churn is detected."""
    monkeypatch.setenv("MUNINN_FORCE_FLIGHT", "false")
    
    # Simulate git status output showing uncommitted changes
    mock_res = MagicMock()
    mock_res.stdout = " M modified_file.py\n"
    
    with patch("ravens.subprocess.run", return_value=mock_res) as mock_run, \
         patch("ravens.SovereignHUD.persona_log") as mock_log, \
         patch("time.sleep") as mock_sleep:
        
        skill._wait_for_silence()
        
        mock_run.assert_called_once()
        mock_log.assert_called_with("INFO", "Matrix is active. Waiting for repository silence...")
        mock_sleep.assert_called_with(10)

def test_wait_for_silence_protocol_clean(skill, monkeypatch):
    """Verify that the Silence Protocol does not wait when the repository is clean."""
    monkeypatch.setenv("MUNINN_FORCE_FLIGHT", "false")
    
    mock_res = MagicMock()
    mock_res.stdout = ""
    
    with patch("ravens.subprocess.run", return_value=mock_res), \
         patch("time.sleep") as mock_sleep:
        
        skill._wait_for_silence()
        mock_sleep.assert_not_called()

def test_execute_flight_cycle_exception_handling(skill):
    """Verify that exceptions during the cycle are caught and total_errors is incremented."""
    with patch.object(skill, "_wait_for_silence", side_effect=RuntimeError("System Malfunction")), \
         patch("time.time", return_value=skill.start_time + 100):
        
        result = asyncio.run(skill.execute_flight_cycle())
        
        assert result.status == "FAILURE"
        assert "System Malfunction" in result.summary
        assert skill.total_errors == 1
        assert skill.cycle_count == 1
