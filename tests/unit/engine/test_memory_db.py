import unittest
from unittest.mock import MagicMock, patch
from pathlib import Path
from src.core.engine.memory_db import MemoryDB

class TestMemoryDB(unittest.TestCase):
    def setUp(self):
        self.project_root = "/mock/root"
        # Patch HallOfRecords and chromadb before initializing MemoryDB
        with patch("src.core.engine.memory_db.HallOfRecords") as mock_hall, \
             patch("src.core.engine.memory_db.chromadb") as mock_chroma:
            self.mock_hall_instance = mock_hall.return_value
            self.mock_chroma = mock_chroma
            self.mock_client = MagicMock()
            self.mock_collection = MagicMock()
            self.mock_chroma.PersistentClient.return_value = self.mock_client
            self.mock_client.get_or_create_collection.return_value = self.mock_collection
            
            self.db = MemoryDB(self.project_root)

    def test_initialization_real(self):
        self.assertFalse(self.db.simulated)
        self.assertEqual(self.db.root, Path(self.project_root))
        self.mock_chroma.PersistentClient.assert_called_once()
        self.assertEqual(self.db.collection, self.mock_collection)

    @patch("src.core.engine.memory_db.chromadb", None)
    @patch("src.core.engine.memory_db.HallOfRecords")
    def test_initialization_simulated(self, mock_hall):
        db = MemoryDB(self.project_root)
        self.assertTrue(db.simulated)
        self.assertIsNone(db.collection)
        self.assertTrue(any(r["id"] == "system::/workflow_deployment" for r in db._mock_records))

    def test_batch_upsert_skills(self):
        skills = [
            {"trigger": "test_skill", "description": "test desc", "metadata": {"foo": "bar"}},
            {"trigger": "test_skill_2", "description": "test desc 2"}
        ]
        self.db.batch_upsert_skills("test_app", skills)
        
        self.mock_collection.upsert.assert_called_once()
        args, kwargs = self.mock_collection.upsert.call_args
        self.assertIn("test_app::test_skill", kwargs["ids"])
        self.assertIn("test desc", kwargs["documents"])
        self.assertEqual(kwargs["metadatas"][0]["app_id"], "test_app")

    def test_upsert_skill(self):
        self.db.upsert_skill("test_app", "test_intent", "test description", {"meta": "data"})
        self.mock_collection.upsert.assert_called_once_with(
            documents=["test description"],
            metadatas=[{"meta": "data", "app_id": "test_app"}],
            ids=["test_app::test_intent"]
        )

    def test_search_intent_real(self):
        self.mock_collection.query.return_value = {
            "ids": [["test_app::test_intent"]],
            "distances": [[0.1]],
            "metadatas": [[{"domain": "TEST"}]],
            "documents": [["test description"]]
        }
        
        results = self.db.search_intent("test_app", "query", n_results=1)
        
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["trigger"], "test_intent")
        self.assertEqual(results[0]["score"], 0.9)
        self.assertEqual(results[0]["domain"], "TEST")

    def test_search_intent_simulated(self):
        self.db.simulated = True
        self.db._mock_records = [
            {"id": "test_app::test_intent", "doc": "target query document", "metadata": {"app_id": "test_app"}}
        ]
        
        # Test exact match
        results = self.db.search_intent("test_app", "test_intent")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["score"], 1.0)
        
        # Test fuzzy match
        self.db.clear_active_ram()
        results = self.db.search_intent("test_app", "target")
        self.assertTrue(results[0]["score"] > 0)

    def test_get_total_skills(self):
        self.mock_collection.count.return_value = 10
        self.assertEqual(self.db.get_total_skills(), 10)
        
        self.db.simulated = True
        self.db._mock_records = [{}, {}]
        self.assertEqual(self.db.get_total_skills(), 2)

    def test_clear_active_ram(self):
        self.db._sim_cache["key"] = "value"
        self.db.clear_active_ram()
        self.assertEqual(len(self.db._sim_cache), 0)

if __name__ == "__main__":
    unittest.main()
