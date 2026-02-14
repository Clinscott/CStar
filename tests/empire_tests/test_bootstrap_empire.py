
import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path
import sys

# Mock dependencies primarily for the HUD import part
sys.modules["src.core.ui"] = MagicMock()
sys.modules["src.core.utils"] = MagicMock()
sys.modules["dotenv"] = MagicMock()

# Import the module under test
# We need to act on the module itself or the function.
# The module code runs some top-level (PROJECT_ROOT resolution).

import src.sentinel._bootstrap as bootstrap_module

class TestBootstrapEmpire:
    
    def setup_method(self):
        # Reset the global flag
        bootstrap_module._BOOTSTRAPPED = False
        
    # @patch("src.sentinel._bootstrap.load_dotenv") removed
    def test_bootstrap_path_injection(self):
        # Patch sys.path globally
        with patch.object(sys, "path", new_callable=MagicMock) as mock_path:
             # Assume PROJECT_ROOT is not in path
             mock_path.__contains__.return_value = False
             
             bootstrap_module.bootstrap()
             
             # Verify insert called
             mock_path.insert.assert_called_with(0, str(bootstrap_module.PROJECT_ROOT))
             
             # Verify load_dotenv called
             mock_dotenv = sys.modules["dotenv"]
             mock_dotenv.load_dotenv.assert_called()

    def test_bootstrap_persona_sync(self):
        # We mocked src.core.ui at top level
        # So we can configure it expectations
        
        # But wait, imports inside function happen at runtime.
        # We need to make sure subsequent calls re-import or use existing sys.modules
        
        # Reset bootstrapped flag
        bootstrap_module._BOOTSTRAPPED = False
        
        mock_ui = sys.modules["src.core.ui"]
        mock_utils = sys.modules["src.core.utils"]
        
        mock_utils.load_config.return_value = {"persona": "ODIN"}
        
        with patch.object(sys, "path", new_callable=MagicMock):
             bootstrap_module.bootstrap()
        
        assert mock_ui.HUD.PERSONA == "ODIN"

    def test_bootstrap_idempotency(self):
        bootstrap_module.bootstrap()
        # Resetting flag is NOT done here, we want to test idempotency
        # But wait, first call sets it to True.
        
        with patch.object(sys, "path", new_callable=MagicMock) as mock_path:
             bootstrap_module.bootstrap()
             mock_path.insert.assert_not_called()

if __name__ == "__main__":
    pytest.main([__file__])
