"""
[SPOKE] Muninn Memory
Lore: "The Well of Mimir."
Purpose: Manage mission ledgers, persistent traces, and evolutionary history.
"""

import json
from pathlib import Path
from typing import Any
from datetime import datetime

class MuninnMemory:
    def __init__(self, root: Path):
        self.root = root
        self.ledger_path = self.root / ".agent" / "tech_debt_ledger.json"
        self.trace_dir = self.root / ".agent" / "traces"
        self.trace_dir.mkdir(parents=True, exist_ok=True)

    def load_ledger(self) -> dict:
        if not self.ledger_path.exists():
            return {"timestamp": "", "top_targets": []}
        try:
            return json.loads(self.ledger_path.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            return {"timestamp": "", "top_targets": []}

    def record_trace(self, mission_id: str, file_path: str, action: str, score_delta: float, status: str):
        """Records a neural trajectory trace for the mission."""
        trace = {
            "timestamp": datetime.now().isoformat(),
            "mission_id": mission_id,
            "file": file_path,
            "action": action,
            "score_delta": score_delta,
            "status": status
        }
        trace_file = self.trace_dir / f"trace_{mission_id}_{int(datetime.now().timestamp())}.json"
        trace_file.write_text(json.dumps(trace, indent=2), encoding='utf-8')
