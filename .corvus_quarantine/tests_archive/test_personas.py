import unittest
import os
import sys
from unittest.mock import patch, MagicMock

# Add script path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.join(BASE_DIR, ".agent", "scripts")
sys.path.append(SCRIPTS_DIR)

import personas

class TestPersonas(unittest.TestCase):
    def setUp(self):
        self.mock_root = "c:/test/project"
        
    def test_get_strategy_odin(self):
        """Test ODIN strategy retrieval."""
        strategy = personas.get_strategy("ODIN", self.mock_root)
        self.assertIsInstance(strategy, personas.OdinStrategy)
        self.assertEqual(strategy.get_voice(), "odin")
        
    def test_get_strategy_alfred(self):
        """Test ALFRED strategy retrieval."""
        strategy = personas.get_strategy("ALFRED", self.mock_root)
        self.assertIsInstance(strategy, personas.AlfredStrategy)
        self.assertEqual(strategy.get_voice(), "alfred")

    def test_get_strategy_god(self):
        """Test GOD/Legacy mapping to Odin."""
        strategy = personas.get_strategy("GOD", self.mock_root)
        self.assertIsInstance(strategy, personas.OdinStrategy)
        self.assertEqual(strategy.get_voice(), "odin")

    def test_get_strategy_default(self):
        """Test fallback to Alfred."""
        strategy = personas.get_strategy("UNKNOWN_PERSONA", self.mock_root)
        self.assertIsInstance(strategy, personas.AlfredStrategy)

    @patch('personas.OdinStrategy.enforce_policy')
    def test_odin_policy_structure(self, mock_enforce):
        """Verify Odin strategy has enforce_policy method."""
        s = personas.OdinStrategy(self.mock_root)
        s.enforce_policy()
        self.assertTrue(mock_enforce.called)

if __name__ == '__main__':
    unittest.main()
