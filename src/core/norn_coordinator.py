import sqlite3
import re
from pathlib import Path
from typing import Optional, Any

class NornCoordinator:
    """
    [🧵] THE LEDGER OF THE NORNS (Next Task Manager)
    Synchronizes tasks.qmd with the active PennyOne database to generate executable 'Beads'.
    """
    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.db_path = project_root / ".stats" / "pennyone.db"
        self.tasks_file = project_root / "tasks.qmd"
        
    def _get_conn(self):
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        return sqlite3.connect(self.db_path, timeout=10.0)

    def _init_db(self):
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS norn_beads (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    description TEXT UNIQUE NOT NULL,
                    priority INTEGER DEFAULT 1,
                    status TEXT DEFAULT 'OPEN',
                    assigned_raven TEXT
                )
            """)
            conn.commit()

    def sync_tasks(self) -> int:
        """Parses tasks.qmd and inserts any open tasks into the ledger."""
        self._init_db()
        if not self.tasks_file.exists():
            return 0
            
        content = self.tasks_file.read_text(encoding="utf-8")
        # Match lines like "- [ ] **Task Name**: Description" or "- [ ] Task description"
        open_tasks = re.findall(r"^\s*-\s*\[\s\]\s+(.+)$", content, re.MULTILINE)
        
        inserted = 0
        with self._get_conn() as conn:
            cursor = conn.cursor()
            for idx, task_desc in enumerate(open_tasks):
                # Calculate priority based on vertical position (higher up = higher priority)
                # But reverse it so top is max priority
                priority = len(open_tasks) - idx
                try:
                    cursor.execute(
                        "INSERT INTO norn_beads (description, priority, status) VALUES (?, ?, 'OPEN')",
                        (task_desc.strip(), priority)
                    )
                    inserted += 1
                except sqlite3.IntegrityError:
                    pass # Already exists
            conn.commit()
        return inserted

    def get_next_bead(self, agent_id: str) -> dict[str, Any] | None:
        """Claims the highest priority OPEN bead for the given agent."""
        self._init_db()
        with self._get_conn() as conn:
            cursor = conn.cursor()
            # Find the highest priority OPEN bead
            cursor.execute("SELECT id, description FROM norn_beads WHERE status = 'OPEN' ORDER BY priority DESC LIMIT 1")
            row = cursor.fetchone()
            if row:
                bead_id, desc = row
                cursor.execute("UPDATE norn_beads SET status = 'IN_PROGRESS', assigned_raven = ? WHERE id = ?", (agent_id, bead_id))
                conn.commit()
                return {"id": bead_id, "description": desc}
        return None

    def resolve_bead(self, bead_id: int) -> None:
        """Marks a bead as RESOLVED and updates tasks.qmd."""
        self._init_db()
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE norn_beads SET status = 'RESOLVED' WHERE id = ?", (bead_id,))
            cursor.execute("SELECT description FROM norn_beads WHERE id = ?", (bead_id,))
            row = cursor.fetchone()
            conn.commit()
            
        if row and self.tasks_file.exists():
            desc = row[0]
            # Replace "- [ ] description" with "- [x] description"
            content = self.tasks_file.read_text(encoding="utf-8")
            # Need a flexible replace in case of minor whitespace changes
            safe_desc = re.escape(desc)
            content = re.sub(rf"^\s*-\s*\[\s\]\s+{safe_desc}$", f"- [x] {desc}", content, flags=re.MULTILINE)
            self.tasks_file.write_text(content, encoding="utf-8")
