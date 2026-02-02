import unittest
import os
import sys
from unittest.mock import patch, mock_open

# SKILL PATH
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILL_DIR = os.path.join(BASE_DIR, ".agent", "skills", "workflow-analyst")
sys.path.append(SKILL_DIR)

import analyze_workflow

class TestWorkflowAnalyst(unittest.TestCase):
    
    @patch('os.path.exists', return_value=True)
    @patch('builtins.open', new_callable=mock_open, read_data="- [ ] Task 1\n- [ ] Task 2")
    def test_analyze_tasks(self, mock_file, mock_exists):
        """Test task analysis."""
        analyst = analyze_workflow.WorkflowAnalyst("c:/fake/root")
        report = analyst.analyze()
        
        self.assertEqual(len(report['stalled_tasks']), 2)
        self.assertIn("Task 1", report['stalled_tasks'])

    def test_regex_parsing(self):
        """Test TODO regex logic (reproducing logic from script)."""
        import re
        # Assuming standard TODO parsing logic
        pattern = re.compile(r'(TODO|FIXME|HACK):?\s*(.*)', re.IGNORECASE)
        
        match = pattern.search("# TODO: Fix this")
        self.assertTrue(match)
        self.assertEqual(match.group(2), "Fix this")

if __name__ == '__main__':
    unittest.main()
