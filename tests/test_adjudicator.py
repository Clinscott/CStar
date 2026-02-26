import json

import pytest

from src.games.odin_protocol.engine.adjudicator import process_queue


@pytest.fixture
def mock_game_files(tmp_path):
    """Creates mock pending actions and state file."""
    odin_dir = tmp_path / "odin_protocol"
    odin_dir.mkdir()

    pending = [
        {
            "warlord": "Odin",
            "choice_id": "A",
            "planet": "Midgard",
            "selected_opt": {"id": "A", "difficulty": "Easy"},
            "effective_stats": {"MIGHT": 10},
            "scenario": {"goal": "Test"}
        }
    ]
    (odin_dir / "pending_actions.json").write_text(json.dumps(pending), encoding='utf-8')

    state = {
        "seed": 123,
        "player_name": "Odin",
        "current_planet_progress": 10.0,
        "force": 100.0,
        "inventory": {},
        "items": []
    }
    (odin_dir / "save_state.json").write_text(json.dumps(state), encoding='utf-8')

    return tmp_path

def test_process_queue_success(mock_game_files, monkeypatch):
    """Verifies that process_queue handles actions and updates state."""
    # Mock adjudicate_choice to return success
    monkeypatch.setattr("src.games.odin_protocol.engine.adjudicator.adjudicate_choice",
                        lambda **kwargs: {"success": True, "dom_delta": 5.0, "force_delta": -1.0, "roll": 0.5, "chance": 0.8})

    # Mock SovereignScenarioEngine
    class MockGM:
        def get_outcome(self, *args): return "Victory!"
    monkeypatch.setattr("src.games.odin_protocol.engine.adjudicator.SovereignScenarioEngine", MockGM)

    results = process_queue(mock_game_files)

    assert len(results) == 1
    assert results[0]["success"] is True

    # Check that state was updated
    state_file = mock_game_files / "odin_protocol" / "save_state.json"
    state = json.loads(state_file.read_text(encoding='utf-8'))
    assert state["current_planet_progress"] == 15.0 # 10 + 5

    # Check that queue was cleared
    assert not (mock_game_files / "odin_protocol" / "pending_actions.json").exists()
