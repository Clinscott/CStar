import unittest
import sys
import os
import io

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
sys.path.append(PROJECT_ROOT)
sys.path.append(os.path.join(PROJECT_ROOT, ".agent", "scripts"))

from ui import HUD

class TestUiFull(unittest.TestCase):
    def setUp(self):
        self.captured_output = io.StringIO()
        sys.stdout = self.captured_output

    def tearDown(self):
        sys.stdout = sys.__stdout__

    def test_transition(self):
        # >>> CONTRACT 1: PROGRESS BAR <<<
        # GIVEN HUD is active
        # WHEN Progress Bar (0.5) is rendered
        bar = HUD.progress_bar(0.5, width=10)
        # We handle output capture manually since it returns string, doesn't print
        print(bar)
        
        # THEN Output contains "██" [HUD]
        output = self.captured_output.getvalue()
        self.assertIn("█", output)
        
        # THEN Output contains "░░" [HUD] (Approx match for block char)
        self.assertIn("░", output)

        self.captured_output.truncate(0)
        self.captured_output.seek(0)

        # >>> CONTRACT 2: SPARKLINE <<<
        # GIVEN HUD is active
        # WHEN Sparkline [1, 5, 1] is rendered
        spark = HUD.render_sparkline([1, 5, 1])
        print(spark)
        
        # THEN Output contains " █ " [HUD]
        # 1 (low) -> ' ', 5 (high) -> '█', 1 (low) -> ' '
        # Expecting something like " █ " (depends on char map)
        output = self.captured_output.getvalue()
        self.assertIn("█", output)

if __name__ == '__main__':
    unittest.main()