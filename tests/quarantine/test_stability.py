import time

import pytest

from src.sentinel.stability import GungnirValidator, TheWatcher


def test_gungnir_validator_stable():
    """Verifies that GungnirValidator correctly identifies a stable fix."""
    validator = GungnirValidator(p0=0.01, p1=0.2)
    # Record 100 successes (should accept)
    for _ in range(100):
        validator.record_trial(success=True)

    assert validator.status == "ACCEPT"

def test_gungnir_validator_flaky():
    """Verifies that GungnirValidator correctly identifies a flaky fix."""
    validator = GungnirValidator(p0=0.01, p1=0.2)
    # Record several failures (should reject)
    for _ in range(5):
        validator.record_trial(success=False)

    assert validator.status == "REJECT"

def test_gungnir_validator_continue():
    """Verifies that GungnirValidator returns CONTINUE when logic is uncertain."""
    validator = GungnirValidator(p0=0.01, p1=0.2)
    # Record a few trials
    validator.record_trial(success=True)
    validator.record_trial(success=False)

    assert validator.status == "CONTINUE"

@pytest.fixture
def mock_watcher(tmp_path):
    """Creates a TheWatcher instance with a temporary root."""
    return TheWatcher(tmp_path)

def test_watcher_load_save_state(mock_watcher, tmp_path):
    """Verifies that TheWatcher loads and saves state correctly."""
    mock_watcher.state["test_file.py"] = {"status": "ACTIVE", "last_edited": 123}
    mock_watcher._save_state()

    new_watcher = TheWatcher(tmp_path)
    assert "test_file.py" in new_watcher.state
    assert new_watcher.state["test_file.py"]["last_edited"] == 123

def test_watcher_is_locked(mock_watcher):
    """Verifies the locking logic in TheWatcher."""
    mock_watcher.state["locked_file.py"] = {"status": "LOCKED", "last_edited": time.time()}
    assert mock_watcher.is_locked("locked_file.py") is True

    mock_watcher.state["active_file.py"] = {"status": "ACTIVE"}
    assert mock_watcher.is_locked("active_file.py") is False

def test_watcher_cooldown(mock_watcher):
    """Verifies that TheWatcher auto-unlocks after cooldown."""
    old_time = time.time() - 3601 # Over 1 hour ago
    mock_watcher.state["old_locked.py"] = {"status": "LOCKED", "last_edited": old_time}

    assert mock_watcher.is_locked("old_locked.py") is False
    assert mock_watcher.state["old_locked.py"]["status"] == "ACTIVE"

def test_watcher_record_edit_fatigue(mock_watcher):
    """Verifies that too many edits lock the file."""
    for i in range(10):
        mock_watcher.record_edit("busy_file.py", f"content version {i}")

    assert mock_watcher.is_locked("busy_file.py") is True
    assert mock_watcher.state["busy_file.py"]["status"] == "LOCKED"

def test_watcher_echo_detection(mock_watcher):
    """Verifies that oscillating edits lock the file."""
    mock_watcher.record_edit("echo.py", "A")
    mock_watcher.record_edit("echo.py", "B")

    # Returning to content "A" should trigger echo detection
    stable = mock_watcher.record_edit("echo.py", "A")

    assert stable is False
    assert mock_watcher.is_locked("echo.py") is True
