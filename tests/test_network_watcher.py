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
    
    @patch('os.remove')
    @patch('subprocess.run')
    @patch('shutil.copy2')
    @patch('shutil.move')
    @patch('network_watcher.get_theme')
    @patch('network_watcher.HUD')
    @patch('os.path.exists', return_value=True) 
    def test_process_file_success(self, mock_exists, mock_hud, mock_get_theme, mock_move, mock_copy, mock_subprocess, mock_remove):
        """Test successful processing flow."""
        # Setup mocks
        mock_get_theme.return_value = {"TITLE": "TEST", "PASS": "PASS", "FAIL": "FAIL", "COLOR_MAIN": "CYAN"}
        
        # Merge success (returncode 0)
        # Fishtest success (returncode 0)
        mock_subprocess.side_effect = [
            MagicMock(returncode=0), # merge_traces
            MagicMock(returncode=0)  # fishtest
        ]
        
        test_file = "c:/test/incoming/trace.json"
        
        network_watcher.process_file(test_file)
        
        # Verification
        # 1. Staging move
        self.assertTrue(mock_move.called)
        # 2. Backup copy
        self.assertTrue(mock_copy.called)
        # 3. Merge called
        self.assertTrue(any("merge_traces.py" in str(c) for c in mock_subprocess.call_args_list[0][0][0]))
        # 4. Fishtest called
        self.assertTrue(any("fishtest.py" in str(c) for c in mock_subprocess.call_args_list[1][0][0]))
        # 5. Cleanup (backup removed)
        self.assertTrue(mock_remove.called)

    @patch('network_watcher.HUD')
    @patch('shutil.move')
    @patch('shutil.copy2')
    @patch('subprocess.run')
    def test_process_file_merge_fail(self, mock_subprocess, mock_copy, mock_move, mock_hud):
        """Test flow stops on merge failure."""
        mock_subprocess.side_effect = [MagicMock(returncode=1)] # Merge fails
        
        network_watcher.process_file("c:/test/fail.json")
        
        # Should call merge
        self.assertEqual(mock_subprocess.call_count, 1) 
        # Should NOT call fishtest
        self.assertFalse(any("fishtest.py" in str(c) for c in mock_subprocess.call_args_list[0][0][0]))

if __name__ == '__main__':
    unittest.main()
