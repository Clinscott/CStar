"""
[Ω] Sovereign RPC Interface
Lore: "The Oracle's eyes see the state of the Realm."
Purpose: Logic for aggregating system state, traces, and suggestions for the HUD.
"""

import json
import sqlite3
from pathlib import Path
from typing import Any, List, Dict

class SovereignRPC:
    def __init__(self, root_path: Path):
        self.root = root_path
        self.db_path = self.root / ".stats" / "pennyone.db"
        self.ledger_path = self.root / ".agent" / "tech_debt_ledger.json"
        self.tasks_path = self.root / "tasks.qmd"

    def get_recent_traces(self, limit: int = 5) -> List[Dict[str, Any]]:
        """Queries the PennyOne database for recent mission traces."""
        if not self.db_path.exists():
            return []
        
        try:
            conn = sqlite3.connect(str(self.db_path))
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM mission_traces ORDER BY timestamp DESC LIMIT ?", 
                (limit,)
            )
            rows = cursor.fetchall()
            conn.close()
            return [dict(r) for r in rows]
        except Exception:
            return []

    def get_architectural_suggestions(self) -> List[str]:
        """Reads and formats suggestions from the tech debt ledger."""
        if not self.ledger_path.exists():
            return []
        
        try:
            with open(self.ledger_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            targets = data.get("top_targets", [])
            suggestions = []
            for t in targets:
                file = t.get("file", "unknown")
                priority = t.get("priority", "ADVICE")
                justification = t.get("justification", "").replace("[ALFRED]: ", "").strip("'\"")
                suggestions.append(f"[{priority}] {file}: {justification}")
            
            return suggestions
        except Exception:
            return []

    def get_dashboard_state(self) -> Dict[str, Any]:
        """Aggregates the full system state for the Sovereign HUD."""
        return {
            "vitals": {
                "status": "OPERATIONAL",
                "uptime": "Active"
            },
            "tasks": self._parse_tasks(),
            "traces": self.get_recent_traces(),
            "suggestions": self.get_architectural_suggestions(),
            "persona": "ALFRED"
        }

    def _parse_tasks(self) -> List[str]:
        """Simple parser for tasks.qmd to extract pending items."""
        if not self.tasks_path.exists():
            return []
        
        try:
            content = self.tasks_path.read_text(encoding="utf-8")
            lines = content.split('\n')
            # Extract unchecked items
            return [l.strip("- [ ] ").strip() for l in lines if l.strip().startswith("- [ ]")]
        except Exception:
            return []
