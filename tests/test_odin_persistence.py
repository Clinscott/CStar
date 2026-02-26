import json
from pathlib import Path

import pytest

from src.games.odin_protocol.engine.persistence import OdinPersistence


@pytest.fixture
def mock_persistence(tmp_path):
    """Creates an OdinPersistence instance with a temporary root."""
    return OdinPersistence(str(tmp_path))

def test_persistence_save_load(mock_persistence, tmp_path):
    """Verifies saving and loading state."""
    state = {"seed": "XYZ", "player_name": "Test"}
    # Mock _git_commit to avoid actual git commands
    mock_persistence._git_commit = lambda msg: None

    mock_persistence.save_state(state, "Earth", "Victory")

    loaded = mock_persistence.load_state()
    assert loaded["seed"] == "XYZ"
    assert loaded["player_name"] == "Test"

    # Check archival file
    world_file = Path(tmp_path) / "odin_protocol" / "worlds" / "world_earth.json"
    assert world_file.exists()
    archived = json.loads(world_file.read_text(encoding='utf-8'))
    assert archived["world_name"] == "Earth"
