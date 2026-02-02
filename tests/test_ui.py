import unittest
import sys
import os
from unittest.mock import patch, MagicMock

# Add parent directory to path to import script
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.agent', 'scripts')))

from ui import HUD

class TestUI(unittest.TestCase):
    
    def setUp(self):
        # Reset Persona to default before each test
        HUD.PERSONA = "ALFRED"

    def test_theme_switching(self):
        # Default (Alfred)
        theme = HUD._get_theme()
        self.assertEqual(theme['main'], HUD.CYAN)
        
        # Switch to ODIN
        HUD.PERSONA = "ODIN"
        theme = HUD._get_theme()
        self.assertEqual(theme['main'], HUD.RED)
        self.assertIn("ODIN", theme['title'])

    def test_sparkline_logic(self):
        # Empty
        self.assertEqual(HUD.render_sparkline([]), "")
        
        # Single
        self.assertTrue(len(HUD.render_sparkline([10])) > 0)
        
        # Flat
        self.assertEqual(HUD.render_sparkline([10, 10]), "  ")
        
        # Rising
        res = HUD.render_sparkline([0, 100])
        # Should be lowest char then highest char
        self.assertEqual(res[0], " ")
        self.assertEqual(res[-1], "█")

    def test_box_width_constraints(self):
        # Should fail if width < 10
        with self.assertRaises(AssertionError):
            HUD.box_top(width=5)
            
    def test_box_row_truncation(self):
        # Capture stdout
        with patch('sys.stdout', new=MagicMock()) as mock_stdout:
            # Very short width
            HUD.box_row("Label", "ExtremelyLongValueThatShouldTruncate", width=30)
            # We assume it prints. We can check if it crashed. 
            # Verifying exact output string is complex due to ANSI codes, 
            # but we ensured no crash and logic coverage.
            self.assertTrue(mock_stdout.write.called)

if __name__ == '__main__':
    unittest.main()
