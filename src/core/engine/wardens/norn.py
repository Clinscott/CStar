"""
[Norn: CAMPAIGN FATE]
Lore: "The Weavers of Destiny."
Purpose: Parse CAMPAIGN_IMPLEMENTATION_PLAN.qmd to find the next actionable task.
"""

from pathlib import Path
from typing import Any

from src.core.norn_coordinator import NornCoordinator
from src.core.engine.wardens.base import BaseWarden


class NornWarden(BaseWarden):
    def __init__(self, root: Path) -> None:
        # Initialize BaseWarden with project root
        super().__init__(root)
        self.plan_path = root / "tasks.qmd"
        self.coordinator = NornCoordinator(root)

    def scan(self) -> list[dict[str, Any]]:
        """
        Norn doesn't just scan for errors, it returns the next Campaign Mission.
        But to fit the interface, we return it as a high-priority 'breach' (task).
        """
        # Scan synchronous map of tasks
        target = self.get_next_target()

        if target:
            # Campaign tasks are treated as CRITICAL breaches because they are the user's primary directive.
            return [{
                "type": "CAMPAIGN_TASK",
                "file": "tasks.qmd",
                "action": target["action"],
                "severity": "CRITICAL",
                "line": target["line_index"] + 1,
                "raw_target": target["raw_target"],
            }]
        return []

    def get_next_target(self) -> dict[str, Any] | None:
        """
        Resolves the next actionable bead from the sovereign bead ledger.
        """
        bead = self.coordinator.peek_next_bead()
        if bead is None:
            return None

        line_index = self.coordinator.ledger.find_projection_line(str(bead["id"]))
        action = bead["rationale"]
        if bead.get("target_path"):
            action = f"{bead['target_path']}: {action}"

        return {
            "type": "CAMPAIGN_TASK",
            "file": "tasks.qmd",
            "action": action,
            "line_index": line_index if line_index is not None else 0,
            "raw_target": {
                **bead,
                "line_index": line_index if line_index is not None else 0,
            },
        }

    def mark_complete(self, target: dict[str, Any]) -> None:
        """
        Marks the action complete in the sovereign bead ledger.
        """
        bead_id = target.get("id") or target.get("bead_id")
        if bead_id is None and isinstance(target.get("raw_target"), dict):
            bead_id = target["raw_target"].get("id")
        if bead_id is None:
            return
        self.coordinator.complete_bead_work(str(bead_id), resolution_note="Norn completed implementation; awaiting validation.")
