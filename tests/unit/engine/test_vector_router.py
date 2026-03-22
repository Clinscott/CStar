import unittest
from unittest.mock import MagicMock
from src.core.engine.vector_router import VectorRouter

class TestVectorRouter(unittest.TestCase):
    def setUp(self):
        self.mock_memory_db = MagicMock()
        self.router = VectorRouter(self.mock_memory_db)

    def test_get_top_domain_core(self):
        self.assertEqual(self.router.get_top_domain("lets-go session", "lets-go session"), "CORE")
        self.assertEqual(self.router.get_top_domain("dormancy wrap", "dormancy wrap"), "CORE")

    def test_get_top_domain_dev(self):
        self.assertEqual(self.router.get_top_domain("debug test", "debug test"), "DEV")
        self.assertEqual(self.router.get_top_domain("git refactor", "git refactor"), "DEV")

    def test_get_top_domain_ui(self):
        self.assertEqual(self.router.get_top_domain("visual matrix", "visual matrix"), "UI")
        self.assertEqual(self.router.get_top_domain("neon glow", "neon glow"), "UI")

    def test_get_top_domain_system(self):
        self.assertEqual(self.router.get_top_domain("daemon process", "daemon process"), "SYSTEM")
        self.assertEqual(self.router.get_top_domain("cortex uplink", "cortex uplink"), "SYSTEM")

    def test_get_top_domain_general(self):
        self.assertEqual(self.router.get_top_domain("hello world", "hello world"), "GENERAL")

if __name__ == "__main__":
    unittest.main()
