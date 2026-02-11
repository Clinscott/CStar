import json
import os
import sys
from typing import Any, Dict, List

# [ALFRED] Ensuring the path is correct for imports
_project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
sys.path.append(_project_root)
sys.path.append(os.path.join(_project_root, "src", "games"))

from odin_protocol.engine.models import Chromosome, UniverseState
from odin_protocol.engine.scenarios import SovereignScenarioEngine


def create_warlord(tier: str) -> UniverseState:
    """
    [Ω] WARLORD FACTORY
    Hydrates a UniverseState based on the requested tier.
    """
    if tier == "MAX_LEVEL_TYRANT":
        # Full inventory, max level
        inventory = {
            f"CHROM_{i}": Chromosome(id=f"CHROM_{i}", name=f"Gene {i}", level=10)
            for i in range(24)
        }
        return UniverseState(
            seed="0xDEADBEEF",
            player_name="Tyrant",
            force=100.0,
            domination_percent=99.9,
            inventory=inventory
        )
    return UniverseState(seed="0xEMPTY")

def create_scenario(intensity: str) -> Dict[str, Any]:
    """
    [Ω] SCENARIO FACTORY
    Returns a raw JSON scenario dict.
    """
    if intensity == "HIGH":
        return {
            "planet_name": "HELLSCAPE",
            "lore": "A world of fire.",
            "failure_penalty": 9.1,
            "difficulty": "Hard",
            "options": [{"id": "A", "difficulty": "Lethal"}]
        }
    return {}

def create_vector_engine():
    """
    [HSV] ENGINE FACTORY
    Returns a SovereignVector instance with a mocked index.
    """
    # Placeholder for actual engine construction if needed in tests
    return {"status": "INDEX_LOADED", "index_size": 150}
