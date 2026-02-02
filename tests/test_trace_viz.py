import unittest
import os
import sys
from unittest.mock import patch, MagicMock

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.join(BASE_DIR, ".agent", "scripts")
sys.path.append(SCRIPTS_DIR)

import trace_viz # Import real module

class TestTraceViz(unittest.TestCase):
    def setUp(self):
        # We can patch the class on the module now
        pass

    @patch('builtins.print')
    def test_box_drawing(self, mock_print):
        """Test box drawing methods."""
        theme = trace_viz.THEMES["ODIN"]
        renderer = trace_viz.TraceRenderer(theme)
        
        renderer.box_top("TEST")
        self.assertTrue(mock_print.called)
        
        mock_print.reset_mock()
        renderer.box_row("Label", "Value")
        self.assertTrue(mock_print.called)

    @patch('builtins.print')
    def test_render_analysis(self, mock_print):
        """Test render analysis execution."""
        theme = trace_viz.THEMES["ODIN"]
        renderer = trace_viz.TraceRenderer(theme)
        
        mock_engine = MagicMock()
        mock_engine.expand_query.return_value = {"token": 1.0}
        mock_engine.tokenize.return_value = ["token"]
        mock_engine.idf.get.return_value = 1.0
        # Mock HUD constants on sv_engine if needed, 
        # but TraceRenderer uses self.theme for colors, except HUD.BOLD/RESET
        # If trace_viz imported HUD, we can patch trace_viz.HUD
        
        with patch('trace_viz.HUD') as mock_hud:
             # Make HUD constants empty strings to avoid format errors
             mock_hud.BOLD = ""
             mock_hud.RESET = ""
             
             renderer.render_analysis(
                query="test query",
                trigger="/test",
                score=0.9,
                is_global=False,
                engine_instance=mock_engine
             )
        self.assertTrue(mock_print.called)

    def test_themes(self):
        """Verify theme dictionaries."""
        odin = trace_viz.THEMES["ODIN"]
        alfred = trace_viz.THEMES["ALFRED"]
        self.assertIn("COLOR_MAIN", odin)
        self.assertIn("COLOR_MAIN", alfred)

if __name__ == '__main__':
    unittest.main()
