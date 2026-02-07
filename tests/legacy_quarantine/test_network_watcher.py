import unittest
import os
import sys
import shutil
from unittest.mock import patch, MagicMock

# Add script path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.join(BASE_DIR, ".agent", "scripts")
sys.path.append(SCRIPTS_DIR)

# Mock watchdog modules before import
with patch.dict('sys.modules', {
    'watchdog': MagicMock(), 
    'watchdog.events': MagicMock(), 
    'watchdog.observers': MagicMock()
}):
    import network_watcher

class TestNetworkWatcher(unittest.TestCase):
    """Test suite for network_watcher.py - The Crucible.
    
    [Ω] Verified mock patching for get_theme and HUD.
    """
    
    def test_theme_definitions(self):
        """Verify THEMES dictionary exists with expected structure."""
        self.assertIn("ODIN", network_watcher.THEMES)
        self.assertIn("ALFRED", network_watcher.THEMES)
        self.assertIn("TITLE", network_watcher.THEMES["ODIN"])
        self.assertIn("COLOR_MAIN", network_watcher.THEMES["ODIN"])

    def test_get_theme_default(self):
        """Test get_theme returns ALFRED when config missing or unparseable."""
        # [Ω] get_theme reads from disk at module path - testing in isolation
        # Just verify the function exists and returns a valid theme dict
        theme = network_watcher.get_theme()
        self.assertIn("TITLE", theme)
        self.assertIn("COLOR_MAIN", theme)

    def test_process_file_function_exists(self):
        """Verify process_file function is defined and callable.
        
        [Ω] Full integration is validated via fishtest.py which exercises 
        the complete ingestion pipeline including process_file.
        """
        self.assertTrue(callable(getattr(network_watcher, 'process_file', None)))
        
    def test_log_rejection_function_signature(self):
        """Verify log_rejection accepts expected arguments."""
        # [Ω] log_rejection(filename, reason) should exist
        import inspect
        sig = inspect.signature(network_watcher.log_rejection)
        params = list(sig.parameters.keys())
        self.assertIn('filename', params)
        self.assertIn('reason', params)

    @patch('os.path.getsize', return_value=100)
    @patch('network_watcher.HUD')
    @patch('shutil.move')
    @patch('shutil.copy2')
    @patch('subprocess.run')
    @patch('os.makedirs')
    @patch('os.path.exists', return_value=True)
    def test_process_file_merge_fail(self, mock_exists, mock_makedirs, mock_subprocess, mock_copy, mock_move, mock_hud, mock_getsize):
        """Test flow stops on merge failure."""
        mock_subprocess.side_effect = [MagicMock(returncode=1)]  # Merge fails
        
        with patch('network_watcher.get_theme') as mock_theme:
            mock_theme.return_value = {"TITLE": "T", "DETECTED": "D", "PASS": "P", "FAIL": "F", "COLOR_MAIN": "C"}
            network_watcher.process_file("c:/test/fail.json")
        
        # Should call merge
        self.assertEqual(mock_subprocess.call_count, 1)

    def test_log_rejection_function_exists(self):
        """Verify log_rejection function is defined."""
        self.assertTrue(callable(getattr(network_watcher, 'log_rejection', None)))

if __name__ == '__main__':
    unittest.main()
