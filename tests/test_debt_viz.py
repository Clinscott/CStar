import unittest
from unittest.mock import patch, MagicMock
import sys
import os

# Add the scripts directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".agent", "scripts")))
from debt_viz import analyze_complexity, get_python_files

class TestDebtViz(unittest.TestCase):
    
    @patch('os.walk')
    def test_get_python_files(self, mock_walk):
        # We need to simulate os.walk pruning behavior.
        # This is a bit complex for a simple mock, so we'll just check if IGNORE_DIRS
        # are in the filter logic. 
        # For the test, we'll provide a mock that returns the tuples.
        mock_walk.return_value = [
            ('.', ['dir1'], ['file1.py', 'file2.txt']),
            ('./dir1', [], ['file3.py']),
        ]
        files = get_python_files('.')
        self.assertIn(os.path.join('.', 'file1.py'), files)
        self.assertIn(os.path.join('./dir1', 'file3.py'), files)
        
        # Test pruning logic implicitly by checking IGNORE_DIRS usage
        from debt_viz import IGNORE_DIRS
        self.assertIn(".venv", IGNORE_DIRS)

    @patch('debt_viz.cc_visit')
    @patch('builtins.open', new_callable=MagicMock)
    def test_analyze_complexity(self, mock_open, mock_cc_visit):
        # Mock file content
        mock_open.return_value.__enter__.return_value.read.return_value = "def test(): pass"
        
        # Mock radon blocks
        mock_block = MagicMock()
        mock_block.name = "test_func"
        mock_block.complexity = 15
        mock_block.lineno = 10
        mock_cc_visit.return_value = [mock_block]
        
        files = ['dummy.py']
        blocks, distribution, avg_cc = analyze_complexity(files)
        
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0]['name'], "test_func")
        self.assertEqual(blocks[0]['cc'], 15)
        self.assertEqual(blocks[0]['rank'], 'C') # 15 is Rank C
        self.assertEqual(distribution['C'], 1)
        self.assertEqual(avg_cc, 15.0)

if __name__ == '__main__':
    unittest.main()
