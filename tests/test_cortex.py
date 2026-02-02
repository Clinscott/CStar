import unittest
import os
import sys

# Add parent path to find .agent
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.agent', 'scripts')))

from engine.cortex import Cortex

class TestCortex(unittest.TestCase):
    def setUp(self):
        self.base_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.agent'))
        self.project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        self.cortex = Cortex(self.project_root, self.base_path)

    def test_ingestion(self):
        # Should have ingested AGENTS.md
        # We can check if brain has skills
        self.assertTrue(len(self.cortex.brain.skills) > 0, "Cortex brain should not be empty")

    def test_query(self):
        # We know "No Web Visualization" is in AGENTS.md
        results = self.cortex.query("web visualization")
        self.assertTrue(len(results) > 0, "Should return results")
        top = results[0]
        self.assertTrue("AGENTS.md" in top['trigger'], "Should find source in AGENTS.md")

if __name__ == '__main__':
    unittest.main()
