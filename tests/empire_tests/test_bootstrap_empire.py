
import pytest
from unittest.mock import MagicMock, patch
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Mock ONLY external/missing dependencies
# Use patch.dict for sys.modules to avoid permanent pollution if possible,
# but here it's module level so we'll just be careful.
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
    
    @patch("src.sentinel._bootstrap.load_dotenv", create=True)
    @patch("src.sentinel._bootstrap.HUD")
    @patch("src.sentinel._bootstrap.load_config", create=True)
    def test_bootstrap_flow(self, mock_load_config, mock_hud, mock_dotenv):
        mock_load_config.return_value = {"persona": "ODIN"}
        
        # We need to manually reset the singleton flag for the test
        _bootstrap._BOOTSTRAPPED = False
        
        _bootstrap.bootstrap()
        
        # Verify dotenv called
        mock_dotenv.assert_called()
        
        # Verify persona sync
        assert mock_hud.PERSONA == "ODIN"

    @patch("src.sentinel._bootstrap.load_dotenv", create=True)
    def test_bootstrap_no_env_file(self, mock_dotenv):
        _bootstrap._BOOTSTRAPPED = False
        with patch("src.sentinel._bootstrap.HUD"), \
             patch("src.sentinel._bootstrap.load_config", return_value={}, create=True):
            _bootstrap.bootstrap()
            mock_dotenv.assert_called()

if __name__ == "__main__":
    pytest.main([__file__])
