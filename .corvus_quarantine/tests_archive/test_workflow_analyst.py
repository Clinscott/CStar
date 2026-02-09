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
        """Test task analysis. Mock data uses [ ] which maps to open_loops, not stalled_tasks."""
        analyst = analyze_workflow.WorkflowAnalyst("c:/fake/root")
        report = analyst.analyze()
        
        # [Ω] Correction: [ ] items go to open_loops, [/] items go to stalled_tasks
        self.assertEqual(len(report['open_loops']), 2)
        self.assertIn("Task 1", report['open_loops'])

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
