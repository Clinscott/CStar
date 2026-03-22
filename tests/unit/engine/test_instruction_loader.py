import unittest
from unittest.mock import MagicMock, patch, PropertyMock
from pathlib import Path
from src.core.engine.instruction_loader import InstructionLoader

class TestInstructionLoader(unittest.TestCase):
    def setUp(self):
        self.project_root = "/mock/root"
        self.loader = InstructionLoader(self.project_root)

    @patch("src.core.engine.instruction_loader.Path.exists")
    def test_add_source(self, mock_exists):
        mock_exists.return_value = True
        self.loader.add_source("/extra/source")
        self.assertIn(Path("/extra/source"), self.loader.extra_sources)

    @patch("src.core.engine.instruction_loader.Path.exists")
    @patch("src.core.engine.instruction_loader.Path.read_text")
    def test_get_instructions_global(self, mock_read, mock_exists):
        mock_exists.return_value = True
        mock_read.return_value = "Global Skill Content"
        
        instructions = self.loader.get_instructions(["GLOBAL:test_skill"])
        
        self.assertIn("### SKILL: GLOBAL:test_skill", instructions)
        self.assertIn("Global Skill Content", instructions)
        self.assertIn("ACTIVE SKILL INSTRUCTIONS", instructions)

    @patch("src.core.engine.instruction_loader.Path.exists")
    @patch("src.core.engine.instruction_loader.Path.read_text")
    def test_get_instructions_local(self, mock_read, mock_exists):
        # 1. Resolve Path: local_skills_path / pure_id / "SKILL.qmd"
        mock_exists.return_value = True
        mock_read.return_value = "Local Skill Content"
        
        # When calling get_instructions(["/test_skill"]), it will try several paths.
        # Setting exists=True will make it pick the first one.
        instructions = self.loader.get_instructions(["/test_skill"])
        self.assertIn("Local Skill Content", instructions)

    def test_get_instructions_empty(self):
        self.assertEqual(self.loader.get_instructions([]), "")

    @patch("src.core.engine.instruction_loader.Path.exists")
    @patch("src.core.engine.instruction_loader.Path.read_text")
    def test_instruction_cache(self, mock_read, mock_exists):
        mock_exists.return_value = True
        mock_read.return_value = "Cached Content"
        
        # First call
        self.loader.get_instructions(["GLOBAL:cached"])
        # Second call
        self.loader.get_instructions(["GLOBAL:cached"])
        
        # read_text should only be called once
        mock_read.assert_called_once()

if __name__ == "__main__":
    unittest.main()
