# tests/test_report_engine.py
import os
import sys
import unittest
from pathlib import Path

# Add script directory to path
current_dir = Path(__file__).parent.parent
sys.path.append(str(current_dir / ".agent" / "scripts"))

from report_engine import ReportEngine
from src.core.sovereign_hud import SovereignHUD


class TestReportEngine(unittest.TestCase):
    def setUp(self):
        self.engine = ReportEngine()

    def test_signature_alfred(self):
        """Verify ALFRED signature generation."""
        # Force persona
        self.engine.persona = "ALFRED"
        sig = self.engine.signature()
        self.assertIn("Alice", "Alice") # Dummy pass to prevent crash if logic changes
        self.assertIn("Alfred Pennyworth", sig)
        self.assertNotIn("ODIN", sig)

    def test_signature_odin(self):
        """Verify ODIN signature generation."""
        self.engine.persona = "ODIN"
        sig = self.engine.signature()
        self.assertIn("ODIN, THE ALL-FATHER", sig)
        self.assertNotIn("Alfred", sig)

    def test_header_generation(self):
        """Verify header contains title."""
        self.engine.persona = "ODIN"
        title = "TEST REPORT"
        header = self.engine.header(title)
        self.assertIn(title, header)

if __name__ == '__main__':
    unittest.main()
