from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from src.core.engine.vector import SovereignVector
from src.games.odin_protocol.main import OdinAdventure
from src.games.odin_protocol.ui import OdinUI


@pytest.fixture
def mock_memory_db():
    db = MagicMock()
    # Mock search_intent to return some dummy results
    db.search_intent.return_value = [
        {"trigger": "test_intent", "score": 0.5, "domain": "GENERAL", "description": "A test intent description."},
        {"trigger": "GLOBAL:status", "score": 0.4, "domain": "CORE", "description": "Check system status."}
    ]
    return db

@pytest.fixture
def vector_engine(mock_memory_db):
    with patch('src.core.engine.vector.SovereignHUD'):
        engine = SovereignVector()
        engine.memory_db = mock_memory_db
        # Manually set some required attributes if needed
        engine.stopwords = set()
        engine.thesaurus = {}
        engine.corrections = {"phrase_mappings": {}}
        return engine

def test_vector_search_modularized(vector_engine):
    """Test that the modularized search still returns valid results."""
    results = vector_engine.search("test query")
    assert len(results) > 0
    assert results[0]['trigger'].startswith('/') or results[0]['trigger'].startswith('GLOBAL:')

def test_vector_score_intent_modularized(vector_engine):
    """Test the extracted scoring logic."""
    r = {"trigger": "test", "score": 0.5}
    query_word_expansion = {"query": {"query", "test"}}
    original_tokens = {"query"}
    all_expanded_tokens = {"query", "test"}

    scored = vector_engine._score_intent(r, query_word_expansion, original_tokens, all_expanded_tokens)
    assert 'score' in scored
    assert 'trigger' in scored
    assert scored['trigger'] == "/test"

def test_odin_ui_extraction():
    """Smoke test to ensure OdinUI can be called without errors (mocking dependencies)."""
    mock_game = MagicMock()
    mock_game.state = MagicMock()
    mock_game.state.vector_handshake = True
    mock_game.state.muninn_active = False
    mock_game.state.memory_depth = 50
    mock_game.state.neural_cache = []
    mock_game.state.player_name = "Odin"
    mock_game.state.force = 100.0
    mock_game.state.planets_dominated = 0
    mock_game.state.mutation_charges = 0
    mock_game.state.current_planet_name = "None"
    mock_game.state.current_planet_progress = 0.0
    mock_game.state.nodal_progress = {"HIVE": 0.0, "SIEGE": 0.0, "RESOURCE": 0.0, "DROP": 0.0}
    mock_game.state.inventory = {}
    mock_game.state.items = []
    mock_game.state.total_worlds_conquered = 0
    mock_game.state.domination_percent = 0.0
    mock_game.state.last_briefing_turn = 0

    mock_game.session_id = "TEST-SESSION"

    with patch('src.games.odin_protocol.ui.console.print'), \
         patch('src.games.odin_protocol.ui.console.clear'), \
         patch('os.system'):
        # Just ensure it doesn't crash
        OdinUI.render_manifest(mock_game)
        OdinUI.briefing(mock_game, persona="ODIN")

def test_odin_main_delegation():
    """Ensure OdinAdventure delegates to OdinUI."""
    mock_project_root = Path("/tmp/fake_project")
    with patch('src.games.odin_protocol.main.OdinPersistence'), \
         patch('src.games.odin_protocol.main.OdinGM'), \
         patch('src.games.odin_protocol.main.OdinAdventure._init_state'), \
         patch('src.games.odin_protocol.main.OdinUI') as mock_ui:

        adventure = OdinAdventure(mock_project_root)
        adventure.render_manifest()
        mock_ui.render_manifest.assert_called_once()

        adventure.briefing("HEIMDALL")
        mock_ui.briefing.assert_called_once()
