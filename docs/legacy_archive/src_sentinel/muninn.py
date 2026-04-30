"""
Muninn: The Raven of Memory & Excellence (Autonomous Improver)
Identity: ODIN/ALFRED Hybrid
Purpose: Entry point for the Ravens Protocol (Facade over decomposed spokes).
Phase 1 Note: Transitional wrapper over the runtime-owned ravens lifecycle.
"""

import asyncio
import os
import sys
from pathlib import Path

from src.core.sovereign_hud import SovereignHUD
from src.core.annex import HeimdallWarden
from src.core.engine.alfred_observer import AlfredOverwatch
from src.core.engine.atomic_gpt import AnomalyWarden
from src.core.metrics import ProjectMetricsEngine
from src.core.engine.ravens_stage import RavensCycleResult
from src.cstar.core.uplink import AntigravityUplink
from src.core.bootstrap import SovereignBootstrap
from src.core.engine.ravens.muninn_hunter import MuninnHunter
from src.core.engine.ravens.muninn_crucible import MuninnCrucible
from src.core.engine.wardens.norn import NornWarden
from src.core.engine.wardens.freya import FreyaWarden
from src.core.engine.wardens.mimir import MimirWarden
from src.core.engine.wardens.valkyrie import ValkyrieWarden

# Alias for legacy test compatibility
GungnirValidator = MuninnCrucible
GungnirSPRT = MuninnCrucible
NornWarden = NornWarden
TheWatcher = MuninnHunter
FreyaWarden = FreyaWarden
HeimdallWarden = HeimdallWarden
MimirWarden = MimirWarden
ValkyrieWarden = ValkyrieWarden


def bootstrap() -> None:
    SovereignBootstrap.execute()

class Muninn:
    """
    [Ω] Muninn Facade (v5.0).
    Now delegates all logic to specialized spokes (Heart, Hunter, Crucible, Memory).
    Enforces 6-hour endurance and isolation.
    """
    def __init__(self, target_path: str | None = None, use_docker: bool = False):
        print("[PULSE] Muninn: Initializing spokes...")
        self.root = Path(target_path or os.getcwd()).resolve()
        
        # Lazy Imports
        from src.core.sovereign_hud import SovereignHUD
        from src.cstar.core.uplink import AntigravityUplink
        
        # Initialize Uplink
        self.uplink = AntigravityUplink()

        from src.core.engine.ravens.muninn_heart import MuninnHeart

        self.heart = MuninnHeart(self.root, self.uplink)
        print("[PULSE] Muninn: Initialization complete.")

    async def run_cycle(self) -> bool:
        """Executes a single autonomous repair cycle via the Heart spoke."""
        return await self.heart.execute_cycle()

    async def run_cycle_contract(self) -> RavensCycleResult:
        """Returns the structured Phase 3 cycle contract while boolean callers remain supported."""
        return await self.heart.execute_cycle_contract()

if __name__ == "__main__":
    # Force unbuffered output for real-time monitoring
    sys.stdout.reconfigure(line_buffering=True)
    
    print("[PULSE] Muninn process started.")
    try:
        m = Muninn()
        print("[PULSE] Muninn starting run_cycle...")
        asyncio.run(m.run_cycle())
    except Exception as e:
        print(f"[PULSE] Muninn FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
