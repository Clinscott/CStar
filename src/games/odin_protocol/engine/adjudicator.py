"""
[ENGINE] Action Adjudicator
Lore: "The high seat of judgment."
Purpose: Processes the tactical queue and updates the universe state.
"""

import json
from pathlib import Path
from typing import Any

# Add project root to path for shared imports
PROJECT_ROOT = Path(__file__).resolve().parents[4]
import sys
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

# [ALFRED] Ensure environment is initialized if needed
try:
    from src.core.bootstrap import SovereignBootstrap
    SovereignBootstrap.execute()
except (ImportError, ValueError, IndexError):
    pass

from src.games.odin_protocol.engine.logic import adjudicate_choice
from src.games.odin_protocol.engine.models import UniverseState
from src.games.odin_protocol.engine.scenarios import SovereignScenarioEngine

def process_queue(project_root: Path) -> list[dict[str, Any]] | None:
    return ActionAdjudicator.execute(project_root)

class ActionAdjudicator:
    """[O.D.I.N.] Orchestration logic for tactical action adjudication and state persistence."""

    @staticmethod
    def execute(project_root: Path) -> list[dict[str, Any]] | None:
        """
        Processes the pending actions queue and updates the persistent universe state.
        """
        queue_path: Path = project_root / "odin_protocol" / "pending_actions.json"
        state_path: Path = project_root / "odin_protocol" / "save_state.json"

        if not queue_path.exists():
            return None

        try:
            with queue_path.open('r', encoding='utf-8') as f:
                actions = json.load(f)
        except (json.JSONDecodeError, OSError):
            return None

        if not actions:
            return None

        # Load State
        try:
            with state_path.open('r', encoding='utf-8') as f:
                state_dict = json.load(f)
            state = UniverseState.from_dict(state_dict)
        except (json.JSONDecodeError, OSError, AttributeError):
            return None

        gm = SovereignScenarioEngine()
        narratives: list[dict[str, Any]] = []

        for action in actions:
            # Adjudicate choice based on stats and scenario
            result = adjudicate_choice(
                state=state,
                choice=action.get("selected_opt", {}),
                stats=action.get("effective_stats", {}),
                scenario=action.get("scenario", {}),
            )

            success: bool = result["success"]
            outcome_text: str = gm.get_outcome(action["warlord"], action["choice_id"], success)

            if success:
                gain: float = result.get("dom_delta", 2.0)
                state.current_planet_progress = min(100.0, state.current_planet_progress + gain)

                # Item Discovery
                item_data = action["scenario"].get("potential_item")
                if item_data:
                    state.items.append(item_data)
                    outcome_text += f"\n[DISCOVERY]: {item_data['name']} acquired!"
            else:
                state.force = max(0.1, state.force + result.get("force_delta", -5.0))
                if result.get("penalty_msg"):
                    outcome_text += f"\n[PENALTY]: {result['penalty_msg']}"

            narratives.append({
                "planet": action["planet"],
                "goal": action["scenario"].get("goal", "Extraction"),
                "conflict": action["scenario"].get("conflict", "Standard opposition"),
                "disaster": action["scenario"].get("disaster", "Structural collapse"),
                "choice": action.get("choice_text", "Unknown"),
                "success": success,
                "text": outcome_text
            })

        # Update State
        with state_path.open("w", encoding='utf-8') as f:
            json.dump(state.to_dict(), f, indent=4)

        # Clear Queue
        queue_path.unlink(missing_ok=True)

        return narratives

if __name__ == "__main__":
    # Resolve project root
    root = Path(__file__).resolve().parents[4]
    results = ActionAdjudicator.execute(root)
    if results:
        print(json.dumps(results, indent=2))
