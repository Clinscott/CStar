#!/usr/bin/env python3
"""
[Ω] Hall of Records Assurance (Handshake)
Lore: "Before the runes are cast, the well must be found."
Purpose: Verifies the integrity of the system's persistent intelligence before execution.
"""

import asyncio
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.sovereign_hud import SovereignHUD
from src.core.mimir_client import mimir

async def ensure_hall_of_records():
    """
    [🔱] THE TRIPLE HANDSHAKE
    Ensures Oracle, Archive, and State are online.
    """
    SovereignHUD.box_top("◤ SYSTEM ASSURANCE HANDSHAKE ◢")
    
    # 1. Oracle Assurance (The Mind)
    SovereignHUD.box_row("ORACLE", "Testing Synaptic Link...")
    reply = await mimir.think("Ping. Status: Operational?")
    if reply:
        SovereignHUD.box_row("STATUS", "ONLINE", SovereignHUD.GREEN)
    else:
        SovereignHUD.box_row("STATUS", "OFFLINE (Void Trace)", SovereignHUD.RED)
        SovereignHUD.box_bottom()
        return False

    # 2. Archive Assurance (The Database)
    stats_dir = PROJECT_ROOT / ".stats"
    db_file = stats_dir / "pennyone.db"
    SovereignHUD.box_row("ARCHIVE", "Checking Hall of Records...")
    if stats_dir.exists() and db_file.exists():
        SovereignHUD.box_row("STATUS", "SYNCHRONIZED", SovereignHUD.GREEN)
    else:
        SovereignHUD.box_row("STATUS", "DESYNCED", SovereignHUD.YELLOW)
        # Note: We continue if it's just a missing DB, as it might be a fresh env

    # 3. State Assurance (The Persistence)
    state_file = PROJECT_ROOT / ".agents" / "sovereign_state.json"
    SovereignHUD.box_row("STATE", "Checking Sovereignty Map...")
    if state_file.exists():
        try:
            # Test write access
            state_file.touch()
            SovereignHUD.box_row("STATUS", "SECURED", SovereignHUD.GREEN)
        except Exception:
            SovereignHUD.box_row("STATUS", "LOCKED", SovereignHUD.RED)
            SovereignHUD.box_bottom()
            return False
    else:
        SovereignHUD.box_row("STATUS", "HOLLOW", SovereignHUD.YELLOW)

    SovereignHUD.box_bottom()
    return True

if __name__ == "__main__":
    success = asyncio.run(ensure_hall_of_records())
    sys.exit(0 if success else 1)
