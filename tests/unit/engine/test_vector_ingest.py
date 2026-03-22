import unittest
from unittest.mock import MagicMock, patch
from pathlib import Path
from src.core.engine.vector_ingest import VectorIngest

class TestVectorIngest(unittest.TestCase):
    def setUp(self):
        self.mock_memory_db = MagicMock()
        self.ingest = VectorIngest(self.mock_memory_db)

    def test_add_skill(self):
        self.ingest.add_skill("trigger", "text", "CORE")
        self.mock_memory_db.upsert_skill.assert_called_once_with("system", "trigger", "text", {"domain": "CORE"})

    def test_batch_add_skills(self):
        skills = [{"trigger": "s1", "description": "d1"}]
        self.ingest.batch_add_skills(skills, "UI")
        self.mock_memory_db.batch_upsert_skills.assert_called_once_with("system", skills)
        self.assertEqual(skills[0]["metadata"]["domain"], "UI")

    @patch("src.core.engine.vector_ingest.Path.glob")
    @patch("src.core.engine.vector_ingest.Path.exists")
    @patch("src.core.engine.vector_ingest.Path.is_file")
    @patch("src.core.engine.vector_ingest.VectorIngest._read_intent")
    def test_load_skills_from_dir(self, mock_read, mock_is_file, mock_exists, mock_glob):
        mock_exists.return_value = True
        
        mock_file = MagicMock(spec=Path)
        mock_file.is_file.return_value = True
        mock_file.suffix = ".qmd"
        mock_file.stem = "test_skill"
        mock_file.name = "test_skill.qmd"
        
        mock_glob.return_value = [mock_file]
        mock_read.return_value = "extracted intent"
        
        # Test with a directory that should trigger "CORE" domain
        with patch("src.core.engine.vector_ingest.Path.name", "core"):
             self.ingest.load_skills_from_dir("/mock/core")
        
        self.mock_memory_db.batch_upsert_skills.assert_called_once()
        args, kwargs = self.mock_memory_db.batch_upsert_skills.call_args
        self.assertEqual(args[1][0]["trigger"], "/test_skill")
        self.assertEqual(args[1][0]["metadata"]["domain"], "CORE")

    def test_read_intent_explicit(self):
        mock_file = MagicMock(spec=Path)
        mock_file.read_text.return_value = "# Intent: My explicit intent\nSome content"
        intent = self.ingest._read_intent(mock_file)
        self.assertEqual(intent, "My explicit intent")

    def test_read_intent_description(self):
        mock_file = MagicMock(spec=Path)
        mock_file.read_text.return_value = "description: My description intent\nSome content"
        intent = self.ingest._read_intent(mock_file)
        self.assertEqual(intent, "My description intent")

    def test_read_intent_header(self):
        mock_file = MagicMock(spec=Path)
        mock_file.suffix = ".qmd"
        mock_file.read_text.return_value = "# My Header Intent\nSome content"
        intent = self.ingest._read_intent(mock_file)
        self.assertEqual(intent, "My Header Intent")

if __name__ == "__main__":
    unittest.main()
