import unittest
import os
import shutil
import sys
import json
from unittest.mock import patch, MagicMock

# Setup paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.join(BASE_DIR, ".agent", "scripts")
sys.path.append(SCRIPTS_DIR)

import personas
from sv_engine import DialogueRetriever, HUD

class TestDominion(unittest.TestCase):
    def setUp(self):
        self.test_root = os.path.join(BASE_DIR, "tests", "mock_dominion")
        if os.path.exists(self.test_root):
            shutil.rmtree(self.test_root)
        os.makedirs(self.test_root)
        
        # Create a dummy AGENTS.md (Non-Compliant)
        self.agents_path = os.path.join(self.test_root, "AGENTS.md")
        with open(self.agents_path, 'w', encoding='utf-8') as f:
            f.write("# Messy File\nI do what I want.")

    def tearDown(self):
        if os.path.exists(self.test_root):
            shutil.rmtree(self.test_root)

    def test_odin_enforcement(self):
        """ODIN must ruthlessy overwrite non-compliant files."""
        odin = personas.get_strategy("ODIN", self.test_root)
        results = odin.enforce_policy()
        
        self.assertTrue(any("REWRITTEN" in r for r in results) or any("CREATED" in r for r in results))
        
        with open(self.agents_path, 'r', encoding='utf-8') as f:
            content = f.read()
            self.assertIn("ODIN PROTOCOL", content)
            self.assertIn("SovereignFish", content)

    def test_alfred_adaptation(self):
        """ALFRED should respect the existing mess."""
        alfred = personas.get_strategy("ALFRED", self.test_root)
        results = alfred.enforce_policy()
        
        self.assertTrue(any("PROVISIONED" in r for r in results))
        
        with open(self.agents_path, 'r', encoding='utf-8') as f:
            content = f.read()
            self.assertIn("# Messy File", content) # Should NOT change

    def test_dialogue_retrieval(self):
        """Verify vector-based dialogue fetching."""
        # Create a temp dialogue file
        d_path = os.path.join(self.test_root, "odin_voice.md")
        with open(d_path, 'w', encoding='utf-8') as f:
            f.write('# INTENT: TEST_INTENT\n"I am Odin."\n"Kneel."')
            
        retriever = DialogueRetriever(d_path)
        
        # Test Match
        response = retriever.get("TEST_INTENT")
        self.assertIn(response, ["I am Odin.", "Kneel."])
        
        # Test Miss
        self.assertIsNone(retriever.get("MISSING_INTENT"))

if __name__ == '__main__':
    unittest.main()
