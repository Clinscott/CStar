import unittest
import os
import sys
from importlib.machinery import SourceFileLoader

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOCK_MATH_PATH = os.path.join(BASE_DIR, "mock_project", "test_math.py")

class TestMockMath(unittest.TestCase):
    def setUp(self):
        if not os.path.exists(MOCK_MATH_PATH):
            self.skipTest("mock_project/test_math.py not found")
        # Since it prints on import, we might want to capture stdout
        self.module = SourceFileLoader("mock_math", MOCK_MATH_PATH).load_module()

    def test_logic(self):
        """Verify the math logic in the mock script."""
        tokens = self.module.tokenize("Hello World")
        self.assertEqual(tokens, ["hello", "world"])
        
        v1 = [1, 0]
        v2 = [1, 0]
        v3 = [0, 1]
        self.assertAlmostEqual(self.module.similarity(v1, v2), 1.0)
        self.assertEqual(self.module.similarity(v1, v3), 0.0)

if __name__ == '__main__':
    unittest.main()
