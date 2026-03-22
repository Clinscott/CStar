import unittest
from unittest.mock import MagicMock
from src.core.engine.vector_shadow import VectorShadow

class TestVectorShadow(unittest.TestCase):
    def setUp(self):
        self.mock_memory_db = MagicMock()
        self.stopwords = {"the", "a", "an"}
        self.thesaurus = {"start": {"begin", "commence"}}
        self.shadow = VectorShadow(self.mock_memory_db, self.stopwords, self.thesaurus)

    def test_search(self):
        self.mock_memory_db.search_intent.return_value = [{"trigger": "test", "score": 0.9}]
        results = self.shadow.search("query")
        
        self.mock_memory_db.search_intent.assert_called_once_with("system", "query", n_results=5)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["trigger"], "test")

    def test_build_index(self):
        # Should do nothing and not raise errors
        self.shadow.build_index()

if __name__ == "__main__":
    unittest.main()
