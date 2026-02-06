import json
import sys
from pathlib import Path

# Add project root to path
ROOT = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT))

from odin_protocol.engine.logic import adjudicate_choice  # noqa: E402
from odin_protocol.engine.models import UniverseState  # noqa: E402
from odin_protocol.engine.scenarios import SovereignScenarioEngine  # noqa: E402


def process_queue(project_root: Path) -> list[dict] | None:
    queue_path = project_root / "odin_protocol" / "pending_actions.json"
    state_path = project_root / "odin_protocol" / "save_state.json"

    if not queue_path.exists():
        return None

    try:
        with queue_path.open() as f:
            actions = json.load(f)
    except (json.JSONDecodeError, OSError):
        return None

    if not actions:
        return None

    # Load State
    try:
        with state_path.open() as f:
            state_dict = json.load(f)
        state = UniverseState.from_dict(state_dict) # Assuming from_dict exists or needed
    except (json.JSONDecodeError, OSError):
        return None

    gm = SovereignScenarioEngine()
    narratives = []

        # Align with Phase 9 signature: adjudicate_choice(state, choice, stats, scenario)
        result = adjudicate_choice(
            state=state,
            choice=action.get("selected_opt", {}),
            stats=action.get("effective_stats", {}),
            scenario=action.get("scenario", {}),
        )
        
        success = result["success"]

        # Calculate result
        outcome_text = gm.get_outcome(action["warlord"], action["choice_id"], success)

        if success:
            gain = result.get("dom_delta", 2.0)
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
            "choice": action["choice_text"],
            "success": success,
            "text": outcome_text
        })

    # Update State
    with state_path.open("w") as f:
        json.dump(state.to_dict(), f, indent=4)

    # Clear Queue
    queue_path.unlink(missing_ok=True)

    return narratives

if __name__ == "__main__":
    results = process_queue(ROOT)
    if results:
        print(json.dumps(results, indent=2))
