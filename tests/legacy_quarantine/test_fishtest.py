import unittest
import os
import sys
from unittest.mock import patch, MagicMock

# fishtest.py is in the root
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(BASE_DIR)

import fishtest

class TestFishtest(unittest.TestCase):
    
    @patch('fishtest.SovereignVector')
    def test_run_test_case_match(self, mock_sv):
        """Test pass condition."""
        mock_engine = MagicMock()
        # Mock engine.search to return a matching result
        mock_engine.search.return_value = [
            {"trigger": "/lets-go", "score": 1.0, "is_global": False}
        ]
        
        case = {
            "query": "start",
            "expected": "/lets-go",
            "min_score": 0.8
        }
        
        passed, _ = fishtest.run_test_case(mock_engine, case)
        self.assertTrue(passed)

    @patch('fishtest.SovereignVector')
    def test_run_test_case_fail_match(self, mock_sv):
        """Test fail on mismatch."""
        mock_engine = MagicMock()
        mock_engine.search.return_value = [
            {"trigger": "/run-task", "score": 1.0, "is_global": False}
        ]
        
        case = {
            "query": "start",
            "expected": "/lets-go",
            "min_score": 0.8
        }
        
        passed, _ = fishtest.run_test_case(mock_engine, case)
        self.assertFalse(passed)

    @patch('fishtest.SovereignVector')
    def test_run_test_case_fail_score(self, mock_sv):
        """Test fail on low score."""
        mock_engine = MagicMock()
        mock_engine.search.return_value = [
            {"trigger": "/lets-go", "score": 0.5, "is_global": False}
        ]
        
        case = {
            "query": "start",
            "expected": "/lets-go",
            "min_score": 0.8
        }
        
        passed, _ = fishtest.run_test_case(mock_engine, case)
        self.assertFalse(passed)

if __name__ == '__main__':
    unittest.main()
