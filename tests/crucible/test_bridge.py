import unittest
import json
import os
import sys
from pathlib import Path

# Add project root to path
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.cstar.core.antigravity_bridge import clean_cli_output

class TestAntigravityBridge(unittest.TestCase):
    """Tier 0: Antigravity Bridge Logic"""

    def test_ansi_stripping(self):
        """Verify that ANSI codes and spinners are removed correctly."""
        raw_input = "\x1B[31mError:\x1B[0m {\"response\": \"OK\"} \x1B[?25l|"
        expected = "{\"response\": \"OK\"}"
        self.assertEqual(clean_cli_output(raw_input).strip(), expected)

    def test_json_extraction_with_noise(self):
        """Verify that JSON can be extracted from surrounding CLI chatter."""
        chatter = (
            "Loaded cached credentials.\n"
            "Checking for updates...\n"
            "{\"status\": \"success\", \"response\": \"Hello\"}\n"
            "Finalizing session..."
        )
        expected = "{\"status\": \"success\", \"response\": \"Hello\"}"
        self.assertEqual(clean_cli_output(chatter).strip(), expected)

    def test_malformed_input(self):
        """Verify handling of input with no JSON block."""
        bad_input = "The void is silent."
        self.assertEqual(clean_cli_output(bad_input), "")

if __name__ == '__main__':
    unittest.main()
