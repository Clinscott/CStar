import sys
import os
import unittest
from unittest.mock import MagicMock, patch
import subprocess

# Add parent directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.agent', 'scripts')))

from latency_check import measure_startup

class TestLatencyCheck(unittest.TestCase):
    
    @patch('subprocess.run')
    def test_measure_startup(self, mock_run):
        # Mock successful runs
        mock_run.return_value.returncode = 0
        
        # Run
        avg = measure_startup(iterations=3)
        
        # Verify calls
        self.assertEqual(mock_run.call_count, 3)
        self.assertIsInstance(avg, float)
        self.assertTrue(avg >= 0)

if __name__ == '__main__':
    unittest.main()
