"""
[ENGINE] Action Adjudicator
Lore: "The high seat of judgment."
Purpose: Processes the tactical queue and updates the universe state.
"""

import json
from pathlib import Path
from typing import Any

from src.games.odin_protocol.engine.logic import adjudicate_choice
from src.games.odin_protocol.engine.models import UniverseState
from src.games.odin_protocol.engine.scenarios import SovereignScenarioEngine


def process_queue(project_root: Path) -> list[dict[str, Any]] | None:
    """
    Processes the pending actions queue and updates the persistent universe state.
    
    Args:
        project_root: Path to the project root directory.
        
    Returns:
        A list of narrative records for each processed action, or None if no queue exists.
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
        # Assuming UniverseState.from_dict or similar exists in models.py
        state = UniverseState.from_dict(state_dict)
    except (json.JSONDecodeError, OSError, AttributeError):
        # Fallback if from_dict doesn't exist
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

def main() -> None:
    """CLI entry point for queue processing."""
    # Resolve project root (adjudicator.py is in src/games/odin_protocol/engine/)
    root = Path(__file__).resolve().parents[4]
    results = process_queue(root)
    if results:
        print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
