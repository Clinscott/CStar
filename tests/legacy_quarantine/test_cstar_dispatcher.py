import unittest
from unittest.mock import patch, MagicMock
import sys
import os

# Fix path to import the script
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.join(BASE_DIR, ".agent", "scripts")
sys.path.append(SCRIPTS_DIR)

import cstar_dispatcher

class TestCStarDispatcher(unittest.TestCase):
    
    @patch('subprocess.run')
    def test_odin_shortcut(self, mock_run):
        """Test the -odin shortcut."""
        with patch.object(sys, 'argv', ['c*', '-odin']):
            cstar_dispatcher.main()
            # Verify it calls set_persona.py with ODIN
            self.assertTrue(mock_run.called)
            args = mock_run.call_args[0][0]
            self.assertIn("set_persona.py", args[1])
            self.assertEqual(args[2], "ODIN")

    @patch('subprocess.run')
    def test_alfred_shortcut(self, mock_run):
        """Test the -alfred shortcut."""
        with patch.object(sys, 'argv', ['c*', '-alfred']):
            cstar_dispatcher.main()
            self.assertTrue(mock_run.called)
            args = mock_run.call_args[0][0]
            self.assertIn("set_persona.py", args[1])
            self.assertEqual(args[2], "ALFRED")

    @patch('subprocess.run')
    def test_persona_command(self, mock_run):
        """Test the persona command explicitly."""
        with patch.object(sys, 'argv', ['c*', 'persona', 'ODIN']):
            cstar_dispatcher.main()
            self.assertTrue(mock_run.called)
            args = mock_run.call_args[0][0]
            self.assertIn("set_persona.py", args[1])
            self.assertEqual(args[2], "ODIN")

    @patch('cstar_dispatcher.help_command')
    def test_help_no_args(self, mock_help):
        """Test it shows help with no args."""
        with patch.object(sys, 'argv', ['c*']):
            cstar_dispatcher.main()
            mock_help.assert_called_once()

if __name__ == '__main__':
    unittest.main()
