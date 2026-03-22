import unittest
from unittest.mock import MagicMock, patch, mock_open
from pathlib import Path
import json
from src.core.engine.vector_config import VectorConfig

class TestVectorConfig(unittest.TestCase):
    def setUp(self):
        self.project_root = Path("/mock/root")
        self.config = VectorConfig(self.project_root)

    @patch("src.core.engine.vector_config.SovereignHUD")
    @patch("src.core.engine.vector_config.Path.exists")
    def test_load_json_success(self, mock_exists, mock_hud):
        mock_exists.return_value = True
        json_data = {"key": "value"}
        with patch("src.core.engine.vector_config.Path.open", mock_open(read_data=json.dumps(json_data))):
             result = self.config.load_json(Path("any.json"))
        
        self.assertEqual(result, json_data)

    def test_load_json_not_exists(self):
        with patch("src.core.engine.vector_config.Path.exists", return_value=False):
            result = self.config.load_json(Path("any.json"))
        self.assertEqual(result, {})

    @patch("src.core.engine.vector_config.SovereignHUD")
    @patch("src.core.engine.vector_config.Path.exists")
    def test_load_json_failure(self, mock_exists, mock_hud):
        mock_exists.return_value = True
        
        with patch("src.core.engine.vector_config.Path.open", side_effect=Exception("error")):
            result = self.config.load_json(Path("test.json"))
            
        self.assertEqual(result, {})
        mock_hud.persona_log.assert_called_with("WARN", "Config load failure [test.json]: error")

    @patch.object(VectorConfig, "load_json")
    def test_load_stopwords_list(self, mock_load_json):
        mock_load_json.return_value = ["a", "the"]
        result = self.config.load_stopwords(Path("mock.json"))
        self.assertEqual(result, {"a", "the"})

    @patch.object(VectorConfig, "load_json")
    def test_load_stopwords_dict(self, mock_load_json):
        mock_load_json.return_value = {"stopwords": ["a", "the"]}
        result = self.config.load_stopwords(Path("mock.json"))
        self.assertEqual(result, {"a", "the"})

    @patch("src.core.engine.vector_config.Path.read_text")
    @patch("src.core.engine.vector_config.Path.exists")
    def test_load_thesaurus(self, mock_exists, mock_read):
        mock_exists.return_value = True
        mock_read.return_value = "- **start**: begin, commence\n- **stop**: end, finish"
        
        result = self.config.load_thesaurus(Path("mock.qmd"))
        
        self.assertEqual(result["start"], {"begin", "commence"})
        self.assertEqual(result["stop"], {"end", "finish"})

if __name__ == "__main__":
    unittest.main()
