import sys
import os
import unittest
from unittest.mock import MagicMock, patch

# Add parent directory to path to import script
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.agent', 'scripts')))

from overwatch import get_stats

class TestNeuralOverwatch(unittest.TestCase):
    
    @patch('builtins.open', new_callable=MagicMock)
    @patch('os.path.exists')
    @patch('json.load')
    def test_get_stats_parsing(self, mock_json, mock_exists, mock_open):
        # Setup Mocks
        mock_exists.return_value = True
        
        # Mock Fishtest Data
        mock_json.return_value = {
            "test_cases": [
                {"tags": ["ODIN"]}, 
                {"tags": ["ALFRED"]}, 
                {"tags": ["ODIN", "ALFRED"]} # War Zone
            ]
        }
        
        # Test
        stats = get_stats()
        
        self.assertEqual(stats["cases"], 3)
        self.assertEqual(stats["war_zones"], 1)
        
    def test_stats_structure(self):
        # Quick check that function returns correct keys even on failure
        # We assume file read fails in this un-mocked run
        stats = get_stats()
        self.assertIn("cases", stats)
        self.assertIn("rejections", stats)
        self.assertIn("war_zones", stats)
        self.assertIsInstance(stats["cases"], int)

if __name__ == '__main__':
    unittest.main()
