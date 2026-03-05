import pytest
import sqlite3
from pathlib import Path
from src.core.norn_coordinator import NornCoordinator

@pytest.fixture
def coordinator(tmp_path):
    """Creates a NornCoordinator pointing to a temporary test DB and tasks file."""
    # Create a mock tasks.qmd
    tasks_content = """# My Tasks
- [ ] Task Alpha: Build the shield
- [x] Task Beta: Already done
- [ ] Task Gamma: Secure the vault
"""
    tasks_file = tmp_path / "tasks.qmd"
    tasks_file.write_text(tasks_content, encoding="utf-8")
    
    coord = NornCoordinator(tmp_path)
    # Redirect internal paths to tmp_path
    coord.db_path = tmp_path / "pennyone.db"
    coord.tasks_file = tasks_file
    return coord

def test_sync_tasks(coordinator):
    """[Ω] Ensures NornCoordinator parses open tasks and assigns priorities correctly."""
    inserted = coordinator.sync_tasks()
    assert inserted == 2
    
    with coordinator._get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT description, priority, status FROM norn_beads ORDER BY priority DESC")
        rows = cursor.fetchall()
        
        # Priority should be higher for Alpha since it was higher in the list
        assert len(rows) == 2
        assert rows[0][0] == "Task Alpha: Build the shield"
        assert rows[1][0] == "Task Gamma: Secure the vault"

def test_get_next_bead(coordinator):
    """[Ω] Ensures agents pluck the highest priority bead and mark it IN_PROGRESS."""
    coordinator.sync_tasks()
    
    bead = coordinator.get_next_bead("RAVEN-1")
    assert bead is not None
    assert bead["description"] == "Task Alpha: Build the shield"
    
    # Verify DB state
    with coordinator._get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT status, assigned_raven FROM norn_beads WHERE id = ?", (bead["id"],))
        status, raven = cursor.fetchone()
        assert status == "IN_PROGRESS"
        assert raven == "RAVEN-1"

def test_resolve_bead(coordinator):
    """[Ω] Ensures resolving a bead updates the database and physically mutates tasks.qmd."""
    coordinator.sync_tasks()
    bead = coordinator.get_next_bead("RAVEN-1")
    
    # Resolve it
    coordinator.resolve_bead(bead["id"])
    
    # Verify DB state
    with coordinator._get_conn() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT status FROM norn_beads WHERE id = ?", (bead["id"],))
        assert cursor.fetchone()[0] == "RESOLVED"
        
    # Verify File state (Physical Checkbox mutation)
    content = coordinator.tasks_file.read_text(encoding="utf-8")
    assert "- [x] Task Alpha: Build the shield" in content
    assert "- [ ] Task Gamma: Secure the vault" in content
