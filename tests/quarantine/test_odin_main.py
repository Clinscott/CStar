from unittest.mock import patch

import pytest

from src.games.odin_protocol.main import OdinAdventure


@pytest.fixture
def mock_adventure(tmp_path, monkeypatch):
    """Creates an OdinAdventure instance with mocked persistence."""
    # Mock OdinPersistence and other imports if needed
    with patch("src.games.odin_protocol.main.OdinPersistence") as mock_p:
        instance = mock_p.return_value
        instance.load_state.return_value = None # New game

        # Patch input to avoid hanging
        monkeypatch.setattr("builtins.input", lambda _: "TestWarlord")
        # Patch os.system to avoid clearing screen during tests
        monkeypatch.setattr("os.system", lambda _: None)

        adv = OdinAdventure(str(tmp_path))
        return adv

def test_odin_adventure_init(mock_adventure):
    """Verifies that OdinAdventure initializes with a name."""
    assert mock_adventure.state.player_name == "TestWarlord"
    assert mock_adventure.state.force == 100.0

def test_odin_adventure_apply_passive_ticker(mock_adventure):
    """Verifies passive ticker logic."""
    mock_adventure.state.current_planet_progress = 10.0
    mock_adventure._apply_passive_ticker(affinity_score=2.0)
    assert mock_adventure.state.current_planet_progress == 12.0
    assert mock_adventure.state.domination_percent == 12.0
