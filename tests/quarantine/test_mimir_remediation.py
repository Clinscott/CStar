from pathlib import Path
from unittest.mock import patch

import pytest

from src.games.odin_protocol.engine.scenarios import SovereignScenarioEngine
from src.games.odin_protocol.main import OdinAdventure


@pytest.fixture
def project_root():
    return Path(__file__).parent.parent.parent.absolute()

def test_vector_search_parity(project_root):
    # Mock MemoryDB to return a dummy result
    with patch('src.core.engine.vector.MemoryDB') as mock_db:
        mock_instance = mock_db.return_value
        mock_instance.search_intent.return_value = [
            {'trigger': 'lets-go', 'score': 0.8}
        ]

        from src.core.engine.vector import SovereignVector
        vector = SovereignVector()

        # Test a direct phrase mapping from corrections.json
        # "please fire up our project now" -> "/lets-go"
        results = vector.search("please fire up our project now")
        assert len(results) > 0
        assert results[0]['trigger'] == "/lets-go"

        # Test semantic search (mocked)
        results = vector.search("deploy the game")
        assert len(results) > 0
        # The trigger will be normalized by our refactored _score_intent
        assert results[0]['trigger'] == "/lets-go"

def test_scenario_generation(project_root):
    engine = SovereignScenarioEngine()
    stats = {"AESIR_MIGHT": 15.0, "MUNINN_MEM": 12.0}
    scenario = engine.generate_scenario(stats, seed="TEST_SEED", turn_id=1)
    assert "planet_name" in scenario
    assert "options" in scenario
    assert len(scenario["options"]) == 4

def test_odin_adventure_init(project_root):
    with patch('builtins.input', return_value='TestWarlord'), \
         patch('os.system'):
        adventure = OdinAdventure(str(project_root))
        assert adventure.state is not None
        assert adventure.state.player_name == 'TestWarlord'
