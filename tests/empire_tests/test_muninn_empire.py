
import pytest
from unittest.mock import MagicMock, patch, mock_open
from pathlib import Path
import sys
import os

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Mock only external/heavy libraries that might be missing
MOCK_EXTERNALS = [
    "google.genai",
    "google.genai.types",
    "colorama"
]
for mod in MOCK_EXTERNALS:
    sys.modules[mod] = MagicMock()

def teardown_module():
    for mod in MOCK_EXTERNALS:
        if mod in sys.modules:
            del sys.modules[mod]

from src.sentinel.muninn import Muninn

class TestMuninnEmpire:
    
    @patch.dict(os.environ, {"GOOGLE_API_KEY": "fake_key"})
    @patch("src.sentinel.muninn.genai.Client")
    def test_init(self, mock_client):
        # We need to patch the constructor dependencies of Muninn
        with patch("src.sentinel.muninn.TheWatcher"), \
             patch("src.sentinel.muninn.ProjectMetricsEngine"), \
             patch("src.sentinel.muninn.AlfredOverwatch"), \
             patch("src.sentinel.muninn.GungnirSPRT"):
            
            muninn = Muninn("dummy_root")
            assert muninn.api_key == "fake_key"
            mock_client.assert_called()

    @patch("src.sentinel.muninn.genai.Client")
    def test_init_no_key(self, mock_client):
        with patch.dict(os.environ, {}, clear=True):
            # The bootstrap call might set it? No.
            with pytest.raises(ValueError, match="GOOGLE_API_KEY"):
                Muninn("dummy_root")

    @patch.dict(os.environ, {"GOOGLE_API_KEY": "fake_key"})
    @patch("src.sentinel.muninn.HUD")
    @patch("src.sentinel.muninn.ThreadPoolExecutor")
    @patch("src.sentinel.muninn.as_completed")
    @patch("src.sentinel.muninn.HeimdallWarden")
    @patch("src.sentinel.muninn.ProjectMetricsEngine")
    @patch("src.sentinel.muninn.TheWatcher")
    @patch("src.sentinel.muninn.GungnirSPRT")
    def test_run_scan_no_breaches(self, mock_sprt, mock_watcher, mock_metrics, mock_heimdall, mock_as_completed, mock_executor, mock_hud):
        muninn = Muninn("dummy_root")
        
        # Mock metrics engine instance
        mock_metrics_inst = mock_metrics.return_value
        mock_metrics_inst.compute.return_value = 80.0
        
        # Mock Heimdall (synch scan)
        mock_annex = mock_heimdall.return_value
        mock_annex.breaches = []
        
        # Mock as_completed to avoid hanging on MagicMocks
        mock_as_completed.side_effect = lambda x: x
        
        # Mock context manager for executor
        mock_executor.return_value.__enter__.return_value = MagicMock()
        
        # Run
        result = muninn.run()
        
        assert result is False
        mock_hud.persona_log.assert_any_call("SUCCESS", "The waters are clear. Heimdall sees no threats.")

    @patch.dict(os.environ, {"GOOGLE_API_KEY": "fake_key"})
    @patch("src.sentinel.muninn.HUD")
    @patch("src.sentinel.muninn.ThreadPoolExecutor")
    @patch("src.sentinel.muninn.as_completed")
    @patch("src.sentinel.muninn.HeimdallWarden")
    @patch("src.sentinel.muninn.ProjectMetricsEngine")
    @patch("src.sentinel.muninn.TheWatcher")
    @patch("src.sentinel.muninn.GungnirSPRT")
    @patch("src.sentinel.muninn.subprocess.run")
    def test_run_with_breach_success(self, mock_sub, mock_sprt, mock_watcher, mock_metrics, mock_heimdall, mock_as_completed, mock_executor, mock_hud):
        muninn = Muninn("dummy_root")
        
        # Mock metrics
        mock_metrics_inst = mock_metrics.return_value
        mock_metrics_inst.compute.side_effect = [80.0, 85.0] # Pre, Post
        
        # Mock as_completed
        mock_as_completed.side_effect = lambda x: x
        
        # Mock Breach
        mock_annex = mock_heimdall.return_value
        mock_annex.breaches = [{
            "file": "bad.py",
            "action": "Fix syntax",
            "severity": "CRITICAL",
            "type": "ANNEX_BREACH"
        }]
        
        # Mock Watcher
        mock_watcher_inst = mock_watcher.return_value
        mock_watcher_inst.is_locked.return_value = False
        mock_watcher_inst.record_edit.return_value = True
        
        # Mock Forge/Gauntlet/Impl
        with patch.object(muninn, "_run_gauntlet", return_value=Path("tests/gauntlet/test_fix.py")), \
             patch.object(muninn, "_generate_implementation", return_value="fixed code"), \
             patch("src.sentinel.muninn.Path.exists", return_value=True), \
             patch("src.sentinel.muninn.Path.read_text", return_value="old code"), \
             patch("src.sentinel.muninn.Path.write_text"), \
             patch("src.sentinel.muninn.shutil.copy"):
                 
                 # Mock SPRT
                 mock_sprt_inst = mock_sprt.return_value
                 mock_sprt_inst.evaluate_delta.return_value = 'PASS'
                 
                 # Mock Verify (Crucible)
                 mock_sub.return_value.returncode = 0 # pytest success
                                 
                 result = muninn.run()
                 assert result is True
                                
    @patch.dict(os.environ, {"GOOGLE_API_KEY": "fake_key"})
    def test_forge_improvement_failure(self):
         with patch("src.sentinel.muninn.TheWatcher"), \
              patch("src.sentinel.muninn.ProjectMetricsEngine"), \
              patch("src.sentinel.muninn.AlfredOverwatch"), \
              patch("src.sentinel.muninn.GungnirSPRT"):
             
             muninn = Muninn("dummy_root")
             
             target = {"file": "bad.py", "action": "Fix me"}
             
             with patch.object(muninn, "_run_gauntlet", return_value=None), \
                  patch("src.sentinel.muninn.Path.exists", return_value=True), \
                  patch("src.sentinel.muninn.Path.read_text", return_value="content"):
                      assert muninn._forge_improvement(target) is False

if __name__ == "__main__":
    pytest.main([__file__])
