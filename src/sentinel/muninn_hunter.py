"""
[SPOKE] Muninn Hunter
Lore: "The Eyes of Huginn."
Purpose: Asynchronous repository scanning and mission prioritization.
"""

import asyncio
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
        """Identifies technical debt 'breaches' across the repository."""
        SovereignHUD.persona_log("INFO", "MuninnHunter: Scanning the matrix for logical breaches...")
        
        ledger = self.memory.load_ledger()
        breaches = ledger.get("top_targets", [])
        
        if not breaches:
            SovereignHUD.persona_log("INFO", "MuninnHunter: The matrix is within nominal parameters.")
            return [], {}

        SovereignHUD.persona_log("SUCCESS", f"MuninnHunter: Identified {len(breaches)} tactical targets.")
        return breaches, ledger

    def select_target(self, breaches: list[dict]) -> dict | None:
        """Selects the highest priority mission from the current breaches."""
        return self.coordinator.select_mission(breaches)
