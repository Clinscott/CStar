import unittest
import os
import sys
import json
from unittest.mock import patch, mock_open

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.join(BASE_DIR, ".agent", "scripts")
sys.path.append(SCRIPTS_DIR)

import compile_session_traces

class TestCompileSessionTraces(unittest.TestCase):
    
    @patch('glob.glob')
    @patch('os.path.exists', return_value=True)
    @patch('builtins.open', new_callable=mock_open)
    @patch('os.rename')
    @patch('os.makedirs')
    def test_compile_traces(self, mock_mkdir, mock_rename, mock_file, mock_exists, mock_glob):
        """Test markdown report generation and archiving."""
        mock_glob.return_value = ['/traces/trace1.json']
        
        # Mock json.load via the file content
        trace_json = '{"query": "q1", "score": 0.9, "match": "/test"}'
        
        # Setup side effects for open:
        # 1. Read trace1.json
        # 2. Write TRACE_REPORT.md
        # 3. Read TRACE_REPORT.md (for terminal output)
        mock_file.side_effect = [
            mock_open(read_data=trace_json).return_value,
            mock_open().return_value,
            mock_open(read_data="# Report").return_value
        ]
        
        compile_session_traces.compile_traces("/traces", "report.md")
        
        # Verify markdown report was written
        # Second call to open should be the report path
        self.assertEqual(mock_file.call_args_list[1][0][0], "report.md")
        
        # Verify archiving
        self.assertTrue(mock_rename.called)

if __name__ == '__main__':
    unittest.main()
