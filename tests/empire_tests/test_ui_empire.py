
import pytest
from unittest.mock import MagicMock, patch, mock_open
from pathlib import Path
import sys
import json

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Mock ctypes to avoid Windows console calls during test
sys.modules["ctypes"] = MagicMock()

from src.core.ui import HUD

class TestUIEmpire:
    
    def setup_method(self):
        # Reset HUD state manually in case it was mocked or initialized
        HUD._INITIALIZED = False
        HUD.PERSONA = "ALFRED"
        HUD.DIALOGUE = None

    @patch("src.core.ui.Path.exists", return_value=True)
    @patch("src.core.ui.Path.open", new_callable=mock_open, read_data='{"persona": "ODIN"}')
    def test_ensure_persona(self, mock_file, mock_exists):
        HUD._ensure_persona()
        assert HUD.PERSONA == "ODIN"
        
    def test_progress_bar(self):
        bar = HUD.progress_bar(0.5, width=10)
        # Should have 5 full blocks
        assert bar.count("█") == 5
        assert bar.count("░") == 5
        
        bar = HUD.progress_bar(1.0, width=10)
        assert bar.count("█") == 10
        
        bar = HUD.progress_bar(0.0, width=10)
        assert bar.count("░") == 10

    def test_sparkline(self):
        data = [0, 10]
        spark = HUD.render_sparkline(data)
        # Should satisfy regex or specific chars
        # 0 -> ' ' (lowest), 10 -> '█' (highest)
        # The chars are " ▂▃▄▅▆▇█"
        assert spark[0] == " "
        assert spark[-1] == "█"

    def test_box_rendering(self, capsys):
        HUD.box_top("TEST TITLE", width=40)
        captured = capsys.readouterr()
        assert "TEST TITLE" in captured.out
        assert "┌" in captured.out
        
        HUD.box_row("Label", "Value", width=40)
        captured = capsys.readouterr()
        assert "Label" in captured.out
        assert "Value" in captured.out
        assert "│" in captured.out
        
        HUD.box_bottom(width=40)
        captured = capsys.readouterr()
        assert "└" in captured.out

    @patch("src.core.ui.Path.cwd")
    def test_log_rejection(self, mock_cwd):
        mock_path = MagicMock()
        mock_cwd.return_value = mock_path
        mock_ledger = MagicMock()
        mock_path.__truediv__.return_value.__truediv__.return_value.__truediv__.return_value.__truediv__.return_value = mock_ledger
        
        mock_ledger.exists.return_value = True
        
        # We need to mock open on the ledger path object
        mock_handle = mock_open()
        mock_ledger.open = mock_handle
        
        HUD.log_rejection("TEST_PERSONA", "Reason", "Details")
        
        mock_handle.assert_called()
        handle = mock_handle()
        handle.write.assert_called()
        args = handle.write.call_args[0][0]
        assert "TEST_PERSONA" in args
        assert "Reason" in args

if __name__ == "__main__":
    pytest.main([__file__])
