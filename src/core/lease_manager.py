import sqlite3
import time
from pathlib import Path

class LeaseManager:
    """
    [🔒] THE FLOCK OF MUNINN: Task Leases
    Synchronizes concurrent Raven executions via a central FTS5 SQLite lock.
    """
    def __init__(self, project_root: Path):
        self.db_path = project_root / ".stats" / "pennyone.db"
        
    def _get_conn(self):
        # Ensure directory exists just in case
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        return sqlite3.connect(self.db_path, timeout=10.0)

    def acquire_lease(self, target_path: str, agent_id: str = "ONE_MIND", duration_ms: int = 300000) -> bool:
        """
        Attempts to acquire an exclusive task lease for a target file.
        Returns True if acquired, False if held by another agent.
        """
        now = int(time.time() * 1000)
        expiry = now + duration_ms
        normalized_path = target_path.replace("\\", "/")

        with self._get_conn() as conn:
            cursor = conn.cursor()
            
            # Ensure table exists (in case Node.js hasn't initialized it yet)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS task_leases (
                    target_path TEXT PRIMARY KEY,
                    agent_id TEXT NOT NULL,
                    lease_expiry INTEGER NOT NULL
                )
            """)

            # 1. Clean up expired leases
            cursor.execute("DELETE FROM task_leases WHERE lease_expiry < ?", (now,))
            
            # 2. Attempt to acquire lease
            try:
                cursor.execute(
                    "INSERT INTO task_leases (target_path, agent_id, lease_expiry) VALUES (?, ?, ?)",
                    (normalized_path, agent_id, expiry)
                )
                conn.commit()
                return True
            except sqlite3.IntegrityError:
                # Primary key constraint failed, meaning it's locked.
                # Check if we already hold the lock
                cursor.execute("SELECT agent_id FROM task_leases WHERE target_path = ?", (normalized_path,))
                row = cursor.fetchone()
                if row and row[0] == agent_id:
                    # Renew the lease
                    cursor.execute("UPDATE task_leases SET lease_expiry = ? WHERE target_path = ?", (expiry, normalized_path))
                    conn.commit()
                    return True
                return False

    def release_lease(self, target_path: str, agent_id: str = "ONE_MIND") -> None:
        """Releases a task lease."""
        normalized_path = target_path.replace("\\", "/")
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM task_leases WHERE target_path = ? AND agent_id = ?",
                (normalized_path, agent_id)
            )
            conn.commit()
