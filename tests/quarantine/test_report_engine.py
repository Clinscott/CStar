# tests/test_report_engine.py
import sys
import unittest
from pathlib import Path

from src.core.report_engine import ReportEngine


class TestReportEngine(unittest.TestCase):
    def setUp(self):
        self.engine = ReportEngine()

    def test_signature_alfred(self):
        """Verify ALFRED signature generation."""
        # Force persona
        self.engine.persona = "ALFRED"
        sig = self.engine.signature()
        self.assertIn("Alice", "Alice") # Dummy pass to prevent crash if logic changes
        self.assertIn("A.L.F.R.E.D. Pennyworth", sig)
        self.assertNotIn("O.D.I.N.", sig)

    def test_signature_odin(self):
        """Verify ODIN signature generation."""
        self.engine.persona = "O.D.I.N."
        sig = self.engine.signature()
        self.assertIn("O.D.I.N., THE ALL-FATHER", sig)
        self.assertNotIn("A.L.F.R.E.D.", sig)

    def test_header_generation(self):
        """Verify header contains title."""
        self.engine.persona = "O.D.I.N."
        title = "TEST REPORT"
        header = self.engine.header(title)
        self.assertIn(title, header)

if __name__ == '__main__':
    unittest.main()
