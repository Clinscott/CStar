
import pytest
from unittest.mock import MagicMock, patch, mock_open, call
from pathlib import Path
import sys
import os

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Mock modules to avoid side effects
sys.modules["google.genai"] = MagicMock()
sys.modules["src.core.annex"] = MagicMock()
sys.modules["src.core.ui"] = MagicMock()
sys.modules["src.sentinel.code_sanitizer"] = MagicMock()
sys.modules["src.core.metrics"] = MagicMock()
sys.modules["src.core.engine.alfred_observer"] = MagicMock()
sys.modules["tests.integration.project_fishtest"] = MagicMock()
sys.modules["src.sentinel.stability"] = MagicMock()
# Mock Wardens
sys.modules["src.sentinel.wardens.norn"] = MagicMock()
sys.modules["src.sentinel.wardens.valkyrie"] = MagicMock()
sys.modules["src.sentinel.wardens.edda"] = MagicMock()
sys.modules["src.sentinel.wardens.runecaster"] = MagicMock()
sys.modules["src.sentinel.wardens.huginn"] = MagicMock()
sys.modules["src.sentinel.wardens.mimir"] = MagicMock()
sys.modules["src.sentinel.wardens.freya"] = MagicMock()

from src.sentinel.muninn import Muninn

class TestMuninnEmpire:
    
    @patch.dict(os.environ, {"GOOGLE_API_KEY": "fake_key"})
    @patch("src.sentinel.muninn.genai.Client")
    def test_init(self, mock_client):
        muninn = Muninn("dummy_root")
        assert muninn.api_key == "fake_key"
        mock_client.assert_called()

    @patch("src.sentinel.muninn.genai.Client")
    def test_init_no_key(self, mock_client):
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(ValueError, match="GOOGLE_API_KEY"):
                Muninn("dummy_root")

    @patch.dict(os.environ, {"GOOGLE_API_KEY": "fake_key"})
    @patch("src.sentinel.muninn.HUD")
    @patch("src.sentinel.muninn.ThreadPoolExecutor")
    @patch("src.sentinel.muninn.HeimdallWarden")
    def test_run_scan_no_breaches(self, mock_heimdall, mock_executor, mock_hud):
        muninn = Muninn("dummy_root")
        
        # Mock metrics engine
        muninn.metrics_engine.compute.return_value = 80.0
        
        # Mock Heimdall (synch scan)
        mock_annex = mock_heimdall.return_value
        mock_annex.scan.return_value = None # It sets .breaches
        mock_annex.breaches = []
        
        # Mock context manager for executor
        mock_executor.return_value.__enter__.return_value = MagicMock()
        
        # Run
        result = muninn.run()
        
        assert result is False
        # Should log success
        mock_hud.persona_log.assert_any_call("SUCCESS", "The waters are clear. Heimdall sees no threats.")

    @patch.dict(os.environ, {"GOOGLE_API_KEY": "fake_key"})
    @patch("src.sentinel.muninn.HUD")
    @patch("src.sentinel.muninn.ThreadPoolExecutor")
    @patch("src.sentinel.muninn.HeimdallWarden")
    @patch("src.sentinel.muninn.subprocess.run")
    def test_run_with_breach_success(self, mock_sub, mock_heimdall, mock_executor, mock_hud):
        muninn = Muninn("dummy_root")
        
        # Mock metrics
        muninn.metrics_engine.compute.side_effect = [80.0, 85.0] # Pre, Post
        
        # Mock Breach
        mock_annex = mock_heimdall.return_value
        mock_annex.breaches = [{
            "file": "bad.py",
            "action": "Fix syntax",
            "severity": "CRITICAL",
            "type": "ANNEX_BREACH"
        }]
        
        # Mock Watcher
        muninn.watcher.is_locked.return_value = False
        muninn.watcher.record_edit.return_value = True
        
        # Mock Forge/Gauntlet/Impl
        with patch.object(muninn, "_run_gauntlet", return_value=Path("tests/gauntlet/test_fix.py")):
            with patch.object(muninn, "_generate_implementation", return_value="fixed code"):
                 # Mock Verify
                 mock_sub.return_value.returncode = 0 # pytest success
                 
                 # Mock SPRT
                 muninn.sprt.evaluate_delta.return_value = 'PASS'
                 
                 # Mock File IO
                 with patch("src.sentinel.muninn.Path.exists", return_value=True):
                     with patch("src.sentinel.muninn.Path.read_text", return_value="old code"):
                        with patch("src.sentinel.muninn.Path.write_text"):
                            with patch("src.sentinel.muninn.shutil.copy"):
                                 
                                result = muninn.run()
                                assert result is True
                                
    @patch.dict(os.environ, {"GOOGLE_API_KEY": "fake_key"})
    def test_forge_improvement_failure(self):
         muninn = Muninn("dummy_root")
         
         target = {"file": "bad.py", "action": "Fix me"}
         
         # Mock _run_gauntlet returning None
         with patch.object(muninn, "_run_gauntlet", return_value=None):
             with patch("src.sentinel.muninn.Path.exists", return_value=True):
                  with patch("src.sentinel.muninn.Path.read_text", return_value="content"):
                      assert muninn._forge_improvement(target) is False

if __name__ == "__main__":
    pytest.main([__file__])
