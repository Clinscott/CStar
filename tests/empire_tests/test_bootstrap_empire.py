
import pytest
from unittest.mock import MagicMock, patch
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Mock ONLY external/missing dependencies
if "dotenv" not in sys.modules:
    sys.modules["dotenv"] = MagicMock()

def teardown_module():
    if "dotenv" in sys.modules:
        if isinstance(sys.modules["dotenv"], MagicMock):
            del sys.modules["dotenv"]

# Modules under test should be imported after local patching if needed,
# but here we can just import it and patch its internal calls.
from src.sentinel import _bootstrap

class TestBootstrapEmpire:
    
    @patch("src.sentinel._bootstrap.load_dotenv")
    @patch("src.sentinel._bootstrap.HUD")
    @patch("src.sentinel._bootstrap.utils.load_config")
    def test_bootstrap_flow(self, mock_load_config, mock_hud, mock_dotenv):
        mock_load_config.return_value = {"persona": "ODIN"}
        
        _bootstrap.bootstrap()
        
        # Verify dotenv called
        mock_dotenv.assert_called()
        
        # Verify persona sync
        assert mock_hud.PERSONA == "ODIN"
        mock_hud._ensure_persona.assert_called()

    @patch("src.sentinel._bootstrap.load_dotenv")
    def test_bootstrap_no_env_file(self, mock_dotenv):
        # Even if file missing, it should call load_dotenv (which handles it)
        with patch("src.sentinel._bootstrap.HUD"), \
             patch("src.sentinel._bootstrap.utils.load_config", return_value={}):
            _bootstrap.bootstrap()
            mock_dotenv.assert_called()

if __name__ == "__main__":
    pytest.main([__file__])
