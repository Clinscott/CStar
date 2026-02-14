
import pytest
from unittest.mock import MagicMock, patch, mock_open
from pathlib import Path
import sys

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# No sys.modules manipulation here for internal components
from src.core.ui import HUD

class TestUIEmpire:
    
    def setup_method(self):
        # Reset HUD static state
        HUD._INITIALIZED = False
        HUD.PERSONA = "ALFRED"
        HUD.DIALOGUE = None

    @patch("src.core.ui.Path.exists", return_value=True)
    @patch("src.core.ui.Path.open", new_callable=mock_open, read_data='{"persona": "ODIN"}')
    def test_ensure_persona(self, mock_file, mock_exists):
        HUD._ensure_persona()
        assert HUD.PERSONA == "ODIN"
        assert HUD._INITIALIZED is True

    def test_progress_bar(self):
        bar = HUD.progress_bar(0.5, width=10)
        # Should have 5 full blocks (█)
        assert bar.count("█") == 5

    def test_sparkline(self):
        data = [0, 5, 10]
        spark = HUD.render_sparkline(data)
        assert len(spark) == 3
        # Lowest should be first char of sparkline chars (space or small bar)
        # We just check it returns a string and contains at least one of the spark chars
        assert isinstance(spark, str)
        assert any(c in " ▂▃▄▅▆▇█" for c in spark)

    def test_box_rendering(self, capsys):
        HUD.box_top("TEST TITLE", width=40)
        HUD.box_row("KEY", "VALUE")
        HUD.box_bottom()
        captured = capsys.readouterr()
        assert "TEST TITLE" in captured.out
        assert "KEY" in captured.out
        assert "VALUE" in captured.out

    @patch("src.core.ui.Path.cwd")
    @patch("src.core.ui.open", new_callable=mock_open)
    def test_log_rejection(self, mock_file, mock_cwd):
        # setup deep path mock for ledger
        mock_path = MagicMock()
        mock_cwd.return_value = mock_path
        
        # HUD.log_rejection uses Path.cwd() / ".agent" / "audit" / "ledger.json"
        HUD.log_rejection("TEST_PERSONA", "Reason", "Details")
        
        # Verify it attempted to open a file
        mock_file.assert_called()

if __name__ == "__main__":
    pytest.main([__file__])
