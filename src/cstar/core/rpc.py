"""
[Ω] Sovereign RPC Interface
Lore: "The Oracle's eyes see the state of the Realm."
Purpose: Logic for aggregating system state, traces, and suggestions for the HUD.
Phase 1 Note: Transitional projection surface only. Runtime and Hall are authoritative.
"""

import json
import sqlite3
from pathlib import Path
from typing import Any

from src.core.engine.bead_ledger import BeadLedger

class SovereignRPC:
    def __init__(self, root_path: Path):
        self.root = root_path
        self.db_path = self.root / ".stats" / "pennyone.db"
        self.ledger_path = self.root / ".agents" / "tech_debt_ledger.json"
        self.bead_ledger = BeadLedger(self.root)

    def get_recent_traces(self, limit: int = 5) -> list[dict[str, Any]]:
        """Queries Hall validation records and projects them into the legacy mission-trace shape."""
        if not self.db_path.exists():
            return []
        
        try:
            conn = sqlite3.connect(str(self.db_path))
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT rowid AS compatibility_id, *
                FROM hall_validation_runs
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (limit,)
            )
            rows = cursor.fetchall()
            conn.close()
            traces: list[dict[str, Any]] = []
            for row in rows:
                payload = dict(row)
                benchmark = json.loads(payload.get("benchmark_json") or "{}")
                pre_scores = json.loads(payload.get("pre_scores_json") or "{}")
                post_scores = json.loads(payload.get("post_scores_json") or "{}")
                traces.append(
                    {
                        "id": payload.get("compatibility_id") or payload.get("legacy_trace_id") or payload.get("validation_id"),
                        "mission_id": benchmark.get("mission_id") or payload.get("scan_id") or payload.get("validation_id"),
                        "file_path": payload.get("target_path"),
                        "target_metric": benchmark.get("target_metric", "overall"),
                        "initial_score": pre_scores.get("overall", 0),
                        "final_score": post_scores.get("overall", 0),
                        "justification": payload.get("notes", ""),
                        "status": payload.get("verdict", "INCONCLUSIVE"),
                        "timestamp": payload.get("created_at", 0),
                    }
                )
            return traces
        except Exception:
            return []

    def get_architectural_suggestions(self) -> list[str]:
        """Reads and formats suggestions from the tech debt ledger."""
        if not self.ledger_path.exists():
            return []
        
        try:
            with open(self.ledger_path, encoding="utf-8") as f:
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

    def get_dashboard_state(self) -> dict[str, Any]:
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

    def _parse_tasks(self) -> list[str]:
        """Projects actionable sovereign beads instead of parsing markdown authority."""
        try:
            beads = self.bead_ledger.list_beads(statuses=("OPEN", "IN_PROGRESS", "READY_FOR_REVIEW"))
            return [
                f"[{bead.id}] {bead.rationale}" if bead.target_path is None else f"[{bead.id}] {bead.rationale} ({bead.target_path})"
                for bead in beads
            ]
        except Exception:
            return []
