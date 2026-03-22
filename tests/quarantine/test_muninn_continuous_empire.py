"""
[EMPIRE TDD CONTRACT]
Scope: Muninn Continuous Ledger Refactor
"""

import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

from src.core.engine.ravens.muninn import Muninn

@pytest.fixture
def test_root(tmp_path: Path):
    agent_dir = tmp_path / ".agents"
    agent_dir.mkdir()
    
    # Mock Tech Debt Ledger
    ledger_data = {
        "top_targets": [
            {
                "file": "src/dummy/flaky.py",
                "priority": "CRITICAL",
                "justification": "Logic score below 3",
                "status": "ACTIVE"
            },
            {
                "file": "src/dummy/stuck.py",
                "priority": "HIGH",
                "justification": "Style issues",
                "status": "BLOCKED_STUCK"
            }
        ]
    }
    
    (agent_dir / "tech_debt_ledger.json").write_text(json.dumps(ledger_data))
    return tmp_path

def test_muninn_select_target_from_ledger(test_root):
    """GIVEN a structured Tech Debt Ledger, WHEN selecting target, THEN parse and prioritize correctly."""
    muninn = Muninn(test_root)
    
    # _select_target_phase now takes all_breaches as a dummy/fallback
    target = muninn._select_target_phase([])
    
    assert target is not None
    assert target["file"] == "src/dummy/flaky.py"
    assert target["severity"] == "CRITICAL"
    assert target["type"] == "WARDEN_CRITICAL"
    
def test_muninn_escalate_stuck_target(test_root):
    """GIVEN a file failing Crucible, WHEN 3 strikes hit, THEN block in Ledger."""
    muninn = Muninn(test_root)
    
    target = {"file": "src/dummy/flaky.py"}
    
    # Mocking observer and watcher
    muninn.observer = MagicMock()
    
    # Force 3 verification failures
    muninn._handle_verification_failure(target, "MimirWarden")
    muninn._handle_verification_failure(target, "MimirWarden")
    muninn._handle_verification_failure(target, "MimirWarden")
    
    # Check ledger
    ledger_path = test_root / ".agents" / "tech_debt_ledger.json"
    data = json.loads(ledger_path.read_text())
    
    flaky_target = [t for t in data["top_targets"] if t["file"] == "src/dummy/flaky.py"][0]
    assert flaky_target["status"] == "BLOCKED_STUCK"
    assert "SYSTEM ERROR" in flaky_target["justification"]

def test_watcher_get_last_edit_time(test_root):
    """GIVEN file manipulations, WHEN requesting last edit time from TheWatcher, THEN return max mtime."""
    from src.core.engine.ravens.stability import TheWatcher
    import time
    
    src_dir = test_root / "src" / "dummy"
    src_dir.mkdir(parents=True)
    
    # Create file
    test_file = src_dir / "test.py"
    test_file.write_text("print('test')")
    
    watcher = TheWatcher(test_root)
    
    time.sleep(0.1) # Wait slightly
    assert watcher.get_last_edit_time() > 0
    
    # Update file
    test_file.write_text("print('test 2')")
    
    assert watcher.get_last_edit_time() >= test_file.stat().st_mtime
