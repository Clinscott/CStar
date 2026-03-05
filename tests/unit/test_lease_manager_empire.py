import pytest
import sqlite3
import time
from pathlib import Path
from src.core.lease_manager import LeaseManager

@pytest.fixture
def temp_lease_manager(tmp_path):
    """Creates a LeaseManager pointing to a temporary test DB."""
    lm = LeaseManager(tmp_path)
    # Ensure the table is created
    with lm._get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS task_leases (
                target_path TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                lease_expiry INTEGER NOT NULL
            )
        """)
        conn.commit()
    return lm

def test_acquire_and_release_lease(temp_lease_manager):
    """[Ω] Ensures a lease can be acquired and subsequently released."""
    target = "src/test_file.py"
    agent = "RAVEN-1"
    
    assert temp_lease_manager.acquire_lease(target, agent) is True
    
    # Another agent should fail to acquire it
    assert temp_lease_manager.acquire_lease(target, "RAVEN-2") is False
    
    # Release it
    temp_lease_manager.release_lease(target, agent)
    
    # Now RAVEN-2 can acquire it
    assert temp_lease_manager.acquire_lease(target, "RAVEN-2") is True

def test_lease_renewal(temp_lease_manager):
    """[Ω] Ensures an agent can renew its own lease."""
    target = "src/test_file.py"
    agent = "RAVEN-1"
    
    assert temp_lease_manager.acquire_lease(target, agent) is True
    # The same agent calling it again should renew it (return True)
    assert temp_lease_manager.acquire_lease(target, agent) is True

def test_lease_expiration(temp_lease_manager):
    """[Ω] Ensures expired leases are cleaned up and can be taken by others."""
    target = "src/test_file.py"
    agent = "RAVEN-1"
    
    # Acquire with a 10ms lease
    assert temp_lease_manager.acquire_lease(target, agent, duration_ms=10) is True
    
    # Wait for expiry
    time.sleep(0.05)
    
    # RAVEN-2 should now be able to acquire it
    assert temp_lease_manager.acquire_lease(target, "RAVEN-2") is True
