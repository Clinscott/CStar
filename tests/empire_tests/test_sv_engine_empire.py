
import pytest
from unittest.mock import MagicMock, patch, mock_open
from pathlib import Path
import sys

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Mock imports BEFORE importing sv_engine to avoid initialization side effects
MOCK_MODULES = [
    "src.core.ui",
    "src.core.engine.vector",
    "src.core.engine.cortex",
    "src.core.engine.dialogue",
    "src.tools.brave_search"
]

for mod in MOCK_MODULES:
    sys.modules[mod] = MagicMock()

def teardown_module():
    for mod in MOCK_MODULES:
        if mod in sys.modules:
            del sys.modules[mod]

from src.core.sv_engine import SovereignEngine

class TestSovereignEngineEmpire:
    
    @patch("src.core.sv_engine.utils.load_config", return_value={"persona": "ALFRED"})
    @patch("src.core.personas.get_strategy")
    @patch("src.core.sv_engine.SovereignVector") # The imported class
    def test_init(self, mock_vector, mock_strat, mock_config):
        engine = SovereignEngine(project_root=Path("dummy_root"))
        
        mock_config.assert_called()
        mock_strat.assert_called()
        
        # Verify vector engine init
        # _init_vector_engine calls SovereignVector()
        mock_vector.assert_called()
        
    @patch("src.core.sv_engine.utils.load_config", return_value={"persona": "ALFRED"})
    @patch("src.core.personas.get_strategy")
    @patch("src.core.sv_engine.SovereignVector")
    @patch("src.core.sv_engine.HUD")
    def test_run_basic_flow(self, mock_hud, mock_vector, mock_strat, mock_config):
        engine = SovereignEngine(project_root=Path("dummy_root"))
        
        # Setup vector search result
        mock_v_instance = mock_vector.return_value
        mock_v_instance.search.return_value = [{
            "trigger": "hello",
            "score": 0.99,
            "is_global": False
        }]
        
        engine.run("hello")
        
        # Verify search called
        mock_v_instance.search.assert_called_with("hello")
        
        # Verify HUD rendering
        mock_hud.box_top.assert_called()
        
    @patch("src.core.sv_engine.utils.load_config", return_value={"persona": "ALFRED"})
    @patch("src.core.personas.get_strategy")
    @patch("src.core.sv_engine.SovereignVector")
    @patch("src.core.sv_engine.BraveSearch")
    @patch("src.core.sv_engine.Cortex")
    @patch("src.core.sv_engine.HUD")
    def test_proactive_lexicon_lift(self, mock_hud, mock_cortex, mock_brave, mock_vector, mock_strat, mock_config):
        engine = SovereignEngine(project_root=Path("dummy_root"))
        
        # Query with unknown term "flux_capacitor"
        # Mock vector engine vocab/stopwords
        mock_v_instance = mock_vector.return_value
        mock_v_instance.vocab = {"known"}
        mock_v_instance.stopwords = {"the"}
        
        # Mock search result with low score to trigger Bifrost
        mock_v_instance.search.return_value = [{"trigger": "none", "score": 0.5, "is_global": False}]
        
        # Mock Brave Search
        mock_brave_inst = mock_brave.return_value
        mock_brave_inst.search.return_value = [{"description": "A time travel device."}]
        
        engine.run("the flux_capacitor is broken")
        
        # Should trigger Brave Search
        mock_brave_inst.search.assert_called()
        args = mock_brave_inst.search.call_args[0][0]
        # Query is "Technical definition and synonyms for flux"
        assert "flux" in args
        
        # Should inject into Cortex
        mock_cortex_inst = mock_cortex.return_value
        mock_cortex_inst.add_node.assert_called()
        node_id = mock_cortex_inst.add_node.call_args[0][0]
        assert "LEXICON:flux_capacitor" in node_id

if __name__ == "__main__":
    pytest.main([__file__])
