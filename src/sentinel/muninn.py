"""
Muninn: The Raven of Memory & Excellence (Autonomous Improver)
Identity: ODIN/ALFRED Hybrid
Purpose: Entry point for the Ravens Protocol (Facade over decomposed spokes).
"""

import asyncio
import os
import sys
from pathlib import Path
from typing import Any

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
        from src.sentinel.muninn_heart import MuninnHeart
        
        # Initialize Uplink
        self.uplink = AntigravityUplink()
        
        # The Heart orchestrates the cycle
        self.heart = MuninnHeart(self.root, self.uplink)
        print("[PULSE] Muninn: Initialization complete.")

    async def run_cycle(self) -> bool:
        """Executes a single autonomous repair cycle via the Heart spoke."""
        return await self.heart.execute_cycle()

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
