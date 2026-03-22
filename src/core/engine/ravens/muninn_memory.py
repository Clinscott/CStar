"""
[SPOKE] Muninn Memory
Lore: "The Well of Mimir."
Purpose: Manage mission ledgers, persistent traces, and evolutionary history.
"""

import json
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from src.core.engine.hall_schema import HallOfRecords, HallSkillObservation


class MuninnMemory:
    def __init__(self, root: Path):
        self.root = root
        self.ledger_path = self.root / ".agents" / "tech_debt_ledger.json"
        self.trace_dir = self.root / ".agents" / "traces"
        self.trace_dir.mkdir(parents=True, exist_ok=True)
        self.hall = HallOfRecords(self.root)

    def repo_id(self) -> str:
        repo = self.hall.get_repository_record() or self.hall.bootstrap_repository()
        return repo.repo_id

    def load_ledger(self) -> dict:
        if not self.ledger_path.exists():
            return {"timestamp": "", "top_targets": []}
        try:
            return json.loads(self.ledger_path.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            return {"timestamp": "", "top_targets": []}

    def record_stage_observation(
        self,
        stage: str,
        outcome: str,
        observation: str,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        observation_id = f"ravens:{stage}:{uuid.uuid4().hex[:12]}"
        self.hall.save_skill_observation(
            HallSkillObservation(
                observation_id=observation_id,
                repo_id=self.repo_id(),
                skill_id=f"ravens:{stage}",
                outcome=outcome,
                observation=observation,
                created_at=int(time.time() * 1000),
                metadata=dict(metadata or {}),
            )
        )
        return observation_id

    def record_trace(self, mission_id: str, file_path: str, action: str, score_delta: float, status: str) -> str:
        """Records a Hall-backed trajectory observation and mirrors a compatibility trace file."""
        trace = {
            "timestamp": datetime.now().isoformat(),
            "mission_id": mission_id,
            "file": file_path,
            "action": action,
            "score_delta": score_delta,
            "status": status,
            "source": "compatibility_projection",
        }
        observation_id = self.record_stage_observation(
            "trace",
            status,
            f"Mission {status.lower()} for {file_path}.",
            trace,
        )
        trace["observation_id"] = observation_id
        safe_mission_id = str(mission_id).replace(":", "_").replace("/", "_").replace("\\", "_")
        trace_file = self.trace_dir / f"trace_{safe_mission_id}_{int(datetime.now().timestamp())}.json"
        trace_file.write_text(json.dumps(trace, indent=2), encoding='utf-8')
        return observation_id

    def sync_intent_integrity_from_sprt(self) -> float | None:
        """Syncs intent integrity into Hall first and mirrors the sovereign projection for compatibility."""
        ledger_path = self.root / ".agents" / "sprt_ledger.json"
        state_path = self.root / ".agents" / "sovereign_state.json"

        if not ledger_path.exists():
            return None

        try:
            with open(ledger_path, "r", encoding="utf-8") as handle:
                history = json.load(handle).get("history", [])

            if not history:
                return None

            latest = history[-1]
            accuracy = float(latest.get("accuracy", 0) or 0)

            repo = self.hall.get_repository_record() or self.hall.bootstrap_repository()
            repo.intent_integrity = accuracy
            repo.updated_at = int(time.time() * 1000)
            self.hall.upsert_repository(repo)

            state: dict[str, Any] = {}
            if state_path.exists():
                try:
                    with open(state_path, "r", encoding="utf-8") as handle:
                        loaded_state = json.load(handle)
                    if isinstance(loaded_state, dict):
                        state = loaded_state
                except (OSError, json.JSONDecodeError):
                    state = {}

            state.setdefault("framework", {})
            state["framework"]["intent_integrity"] = accuracy

            state_path.parent.mkdir(parents=True, exist_ok=True)
            with open(state_path, "w", encoding="utf-8") as handle:
                json.dump(state, handle, indent=2)

            self.record_stage_observation(
                "memory",
                "SUCCESS",
                f"Intent integrity synced to {accuracy:.2f}.",
                {"accuracy": accuracy},
            )
            return accuracy
        except Exception:
            return None
