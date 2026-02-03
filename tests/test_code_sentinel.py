import unittest
import os
import sys
import json
from unittest.mock import patch, MagicMock

# Add script path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.join(BASE_DIR, ".agent", "scripts")
sys.path.append(SCRIPTS_DIR)

import code_sentinel

class TestCodeSentinel(unittest.TestCase):
    
    @patch('subprocess.run')
    def test_run_ruff_empty(self, mock_run):
        """Test run_ruff with empty output."""
        mock_run.return_value = MagicMock(stdout="")
        results = code_sentinel.run_ruff("test.py")
        self.assertEqual(results, [])

    @patch('subprocess.run')
    def test_run_ruff_with_data(self, mock_run):
        """Test run_ruff with mock JSON data."""
        mock_data = [{"code": "F401", "message": "Unused import", "filename": "test.py", "location": {"row": 1, "column": 1}}]
        mock_run.return_value = MagicMock(stdout=json.dumps(mock_data))
        results = code_sentinel.run_ruff("test.py")
        self.assertEqual(results, mock_data)

    @patch('builtins.print')
    def test_format_results(self, mock_print):
        """Test format_results doesn't crash."""
        violations = [{"code": "F401", "message": "Unused", "filename": "t.py", "location": {"row": 1, "column": 1}}]
        # Should run without error
        code_sentinel.format_results(violations, "t.py")
        self.assertTrue(mock_print.called)

if __name__ == '__main__':
    unittest.main()
