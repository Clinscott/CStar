import unittest
import os
import sys
from unittest.mock import patch, mock_open

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.join(BASE_DIR, ".agent", "scripts")
sys.path.append(SCRIPTS_DIR)

import lightning_rod

class TestLightningRod(unittest.TestCase):
    
    @patch('builtins.open', new_callable=mock_open, read_data="original content")
    @patch('os.path.exists', return_value=True)
    @patch('time.sleep') 
    @patch('lightning_rod.HUD') 
    def test_optimize_file_append(self, mock_hud, mock_sleep, mock_exists, mock_file):
        """Test optimization appends signature."""
        lightning_rod.optimize_file("c:/test/file.txt")
        handle = mock_file()
        handle.write.assert_called()
        args, _ = handle.write.call_args
        self.assertIn("# Optimized by Agent Lightning", args[0])

    @patch('builtins.open', new_callable=mock_open, read_data="content\n\n# Optimized by Agent Lightning")
    @patch('os.path.exists', return_value=True)
    @patch('time.sleep')
    @patch('lightning_rod.HUD')
    def test_optimize_file_already_done(self, mock_hud, mock_sleep, mock_exists, mock_file):
        """Test skip if already optimized."""
        lightning_rod.optimize_file("c:/test/file.txt")
        handle = mock_file()
        handle.write.assert_not_called()

if __name__ == '__main__':
    unittest.main()
