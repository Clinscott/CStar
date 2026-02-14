
import pytest
from unittest.mock import MagicMock, patch
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.sentinel import _bootstrap

class TestBootstrapEmpire:
    
    def setup_method(self):
        _bootstrap._BOOTSTRAPPED = False

    @patch("src.core.utils.load_config")
    @patch("src.sentinel._bootstrap.HUD")
    @patch("src.sentinel._bootstrap.load_dotenv", create=True)
    def test_bootstrap_flow(self, mock_dotenv, mock_hud, mock_load_config):
        # We patch load_config in src.core.utils because _bootstrap imports it locally
        mock_load_config.return_value = {"persona": "ODIN"}
        
        _bootstrap.bootstrap()
        
        # Verify persona sync
        assert mock_hud.PERSONA == "ODIN"

    @patch("src.core.utils.load_config", return_value={})
    @patch("src.sentinel._bootstrap.HUD")
    @patch("src.sentinel._bootstrap.load_dotenv", create=True)
    def test_bootstrap_no_env_file(self, mock_dotenv, mock_hud, mock_load_config):
        _bootstrap.bootstrap()
        mock_dotenv.assert_called()

if __name__ == "__main__":
    pytest.main([__file__])
