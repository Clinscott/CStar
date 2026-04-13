"""
Muninn: The Raven of Memory & Excellence (Autonomous Improver)
Identity: ODIN/ALFRED Hybrid
Purpose: Entry point for the Ravens Protocol (Facade over decomposed spokes).
[Ω] Core logic now resides in MuninnHeart; this acts as the primary facade.
"""
import asyncio
import os
import sys
from pathlib import Path

# --- BOOTSTRAP: Align with Project Root ---
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.engine.ravens_stage import RavensCycleResult
from src.cstar.core.uplink import AntigravityUplink

# Import the core logic from MuninnHeart
from src.core.engine.ravens.muninn_heart import MuninnHeart 

class Muninn:
    """
    [Ω] Muninn Facade (v5.0).
    Delegates all logic to specialized spokes (Heart, Hunter, Crucible, Memory).
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

        self.heart = MuninnHeart(self.root, self.uplink)
        print("[PULSE] Muninn: Initialization complete.")

    async def run_cycle(self) -> bool:
        """Executes one autonomous repair cycle via the Heart spoke."""
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
