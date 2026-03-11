"""
[SPOKE] Muninn Hunter
Lore: "The Eyes of Huginn."
Purpose: Asynchronous repository scanning and mission prioritization.
"""

from pathlib import Path
from typing import Any

from src.sentinel.coordinator import MissionCoordinator
from src.core.sovereign_hud import SovereignHUD


class MuninnHunter:
    def __init__(self, root: Path, memory: Any):
        self.root = root
        self.memory = memory
        self.coordinator = MissionCoordinator(root)

    async def execute_hunt(self) -> tuple[list[dict], dict]:
        """Resolves the next canonical hunt target from the sovereign bead ledger."""
        SovereignHUD.persona_log("INFO", "MuninnHunter: Scanning the Hall-backed bead queue for the next mission...")
        mission = self.coordinator.select_mission([], allow_legacy_fallback=False)
        if mission is None:
            SovereignHUD.persona_log("INFO", "MuninnHunter: The matrix is within nominal parameters.")
            return [], {"source": "hall_beads", "count": 0}

        SovereignHUD.persona_log("SUCCESS", "MuninnHunter: Identified one canonical sovereign mission.")
        return [mission], {"source": "hall_beads", "count": 1}

    def select_target(self, breaches: list[dict]) -> dict | None:
        """Selects the highest priority mission from canonical beads, then compatibility breaches if necessary."""
        if breaches and breaches[0].get("compatibility_source") == "hall_beads":
            return breaches[0]
        return self.coordinator.select_mission(breaches, allow_legacy_fallback=False)
