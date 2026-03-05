"""
[Ω] Sovereign Vitals Spoke
Lore: "The Oracle's eyes see the state of the Realm."
Purpose: Aggregates system health, traces, and suggestions for the HUD.
"""

import json
import sys
from pathlib import Path
from typing import Any

# Bootstrap pathing
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.cstar.core.rpc import SovereignRPC

def get_vitals() -> dict[str, Any]:
    """Retrieves the current system vitals from the RPC engine."""
    rpc = SovereignRPC(PROJECT_ROOT)
    try:
        return rpc.get_dashboard_state()
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    vitals = get_vitals()
    print(json.dumps(vitals))
