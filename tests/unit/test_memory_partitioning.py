import unittest
from src.core.engine.memory_db import MemoryDB
import os
import shutil

class TestMemoryPartitioning(unittest.TestCase):
    def setUp(self):
        # Use a unique ID for each test run to avoid lock issues
        import uuid
        self.test_root = f"tests/tmp_memory_{uuid.uuid4().hex}"
        if not os.path.exists(self.test_root):
            os.makedirs(self.test_root)
        self.db = MemoryDB(self.test_root)

    def tearDown(self):
        # Attempt cleanup but don't fail if Windows holds a lock
        # ChromaDB handles can be sticky on Windows
        self.db = None
        import gc
        gc.collect()
        try:
            if os.path.exists(self.test_root):
                shutil.rmtree(self.test_root, ignore_errors=True)
        except Exception:
            pass

    def test_context_isolation(self):
        """
        Verifies that KeepOS cannot see or overwrite D&D memories even with identical intent IDs.
        """
        # 1. Upsert identical intent_ids for different apps
        self.db.upsert_skill("keep_os", "optimize", "Optimize system performance and RAM usage.")
        self.db.upsert_skill("dnd_engine", "optimize", "Optimize character stat distribution for a Paladin.")

        # 2. Search from KeepOS context
        keep_results = self.db.search_intent("keep_os", "optimize")
        self.assertEqual(len(keep_results), 1)
        self.assertEqual(keep_results[0]["trigger"], "optimize")
        self.assertIn("system performance", keep_results[0]["description"])

        # 3. Search from D&D context
        dnd_results = self.db.search_intent("dnd_engine", "optimize")
        self.assertEqual(len(dnd_results), 1)
        self.assertEqual(dnd_results[0]["trigger"], "optimize")
        self.assertIn("character stat", dnd_results[0]["description"])

    def test_prefix_stripping(self):
        """
        Verifies that trigger IDs returned do not contain the app_id:: prefix
        and preserve nested delimiters.
        """
        self.db.upsert_skill("test_app", "my_intent", "Test description")
        self.db.upsert_skill("test_app", "nested::intent::id", "Nested test")
        
        results = self.db.search_intent("test_app", "my_intent")
        self.assertEqual(results[0]["trigger"], "my_intent")
        self.assertNotIn("test_app::", results[0]["trigger"])

        results = self.db.search_intent("test_app", "nested")
        self.assertEqual(results[0]["trigger"], "nested::intent::id")

if __name__ == "__main__":
    unittest.main()
