
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.sv_engine import SovereignEngine


class TestSovereignEngineEmpire:

    @patch("src.core.sv_engine.utils.load_config", return_value={"persona": "ALFRED"})
    @patch("src.core.sv_engine.personas.get_strategy")
    @patch("src.core.sv_engine.SovereignVector")
    @patch("src.core.sv_engine.SovereignHUD")
    def test_init(self, mock_hud, mock_vector, mock_strat, mock_config):
        engine = SovereignEngine(project_root=Path("dummy_root"))
        mock_config.assert_called()
        mock_strat.assert_called()

    @patch("src.core.utils.load_config", return_value={"persona": "ALFRED"})
    @patch("src.core.utils.input_with_timeout", return_value="n")
    @patch("src.core.sv_engine.personas.get_strategy")
    @patch("src.core.sv_engine.SovereignVector")
    @patch("src.core.sv_engine.SovereignHUD")
    def test_run_basic_flow(self, mock_hud, mock_vector, mock_strat, mock_input, mock_config):
        engine = SovereignEngine(project_root=Path("dummy_root"))
        mock_v_instance = mock_vector.return_value
        mock_v_instance.search.return_value = [{"trigger": "hello", "score": 0.99, "is_global": False}]

        engine.run("hello")
        mock_v_instance.search.assert_called_with("hello")
        mock_hud.box_top.assert_called()

    @patch("src.core.sv_engine.utils.load_config", return_value={"persona": "ALFRED"})
    @patch("src.core.sv_engine.personas.get_strategy")
    @patch("src.core.sv_engine.SovereignVector")
    @patch("src.core.sv_engine.BraveSearch")
    @patch("src.core.sv_engine.Cortex")
    @patch("src.core.sv_engine.SovereignHUD")
    def test_proactive_lexicon_lift(self, mock_hud, mock_cortex, mock_brave, mock_vector, mock_strat, mock_config):
        engine = SovereignEngine(project_root=Path("dummy_root"))
        mock_v_instance = mock_vector.return_value
        # Make flux and capacitor known, but broken unknown to be predictable
        mock_v_instance.vocab = {"flux", "capacitor"}
        mock_v_instance.stopwords = {"the", "is"}
        mock_v_instance.search.return_value = [{"trigger": "none", "score": 0.5, "is_global": False}]

        mock_brave_inst = mock_brave.return_value
        mock_brave_inst.search.return_value = [{"description": "Something not working.", "title": "Fixing things", "url": "http://example.com"}]

        # Use a query where 'broken' is the clear unknown
        engine.run("the flux_capacitor is broken")

        mock_brave_inst.search.assert_called()
        args = mock_brave_inst.search.call_args[0][0]
        assert "broken" in args

        mock_cortex_inst = mock_cortex.return_value
        mock_cortex_inst.add_node.assert_called()
        node_id = mock_cortex_inst.add_node.call_args[0][0]
        assert "LEXICON:broken" in node_id

if __name__ == "__main__":
    pytest.main([__file__])
