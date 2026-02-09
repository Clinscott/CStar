import unittest
import os
import sys
from importlib.machinery import SourceFileLoader
from unittest.mock import patch, MagicMock

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHAOS_PATH = os.path.join(BASE_DIR, "tests", "chaos_monkey_trace.py")

class TestChaosMonkey(unittest.TestCase):
    def setUp(self):
        if not os.path.exists(CHAOS_PATH):
            self.skipTest("chaos_monkey_trace.py not found")
        
        # Patch trace_viz before loading chaos script
        with patch.dict('sys.modules', {'trace_viz': MagicMock()}):
            self.module = SourceFileLoader("chaos_monkey", CHAOS_PATH).load_module()

    @patch('builtins.print')
    def test_run_test_case(self, mock_print):
        """Test success path of run_test_case."""
        with patch.object(self.module, 'visualize_trace') as mock_viz:
            res = self.module.run_test_case("Test", "input")
            self.assertTrue(res)
            self.assertTrue(mock_viz.called)

    @patch('builtins.print')
    def test_run_test_case_fail(self, mock_print):
        """Test failure path of run_test_case."""
        with patch.object(self.module, 'visualize_trace', side_effect=Exception("Chaos")):
            res = self.module.run_test_case("Test", "input")
            self.assertFalse(res)

if __name__ == '__main__':
    unittest.main()
