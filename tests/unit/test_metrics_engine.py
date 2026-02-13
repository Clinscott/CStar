import unittest
import os
import json
from src.core.metrics import ProjectMetricsEngine
from src.core.prompt_linter import PromptLinter

class TestMetricsEngine(unittest.TestCase):
    def test_linter_parse(self):
        linter = PromptLinter()
        # Mock a prompty file
        with open("test.prompty", "w") as f:
            f.write("Hello {{name}}, welcome to {{project}}.")
        
        vars = linter.parse_prompty_vars("test.prompty")
        self.assertIn("name", vars)
        self.assertIn("project", vars)
        os.remove("test.prompty")
        
    def test_metrics_compute(self):
        engine = ProjectMetricsEngine()
        gphs = engine.compute()
        self.assertIsInstance(gphs, float)
        self.assertGreaterEqual(gphs, 0)
        self.assertLessEqual(gphs, 100)

    def test_sprt_delta(self):
        from tests.integration.project_fishtest import GungnirSPRT
        sprt = GungnirSPRT()
        self.assertEqual(sprt.evaluate_delta(0.5, 0.6), 'PASS')
        self.assertEqual(sprt.evaluate_delta(0.6, 0.5), 'FAIL')

if __name__ == "__main__":
    unittest.main()
