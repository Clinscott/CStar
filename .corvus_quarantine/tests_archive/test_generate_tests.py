import unittest
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.join(BASE_DIR, ".agent", "scripts")
sys.path.append(SCRIPTS_DIR)

import generate_tests

class TestGenerateTests(unittest.TestCase):
    
    def test_combinatorial_generation(self):
        """Test generator logic."""
        # generate_cases(n=1000, threshold=0.3)
        result = generate_tests.generate_cases(n=10)
        
        cases = result['test_cases']
        
        # Should correspond to n=10
        self.assertEqual(len(cases), 10)
        
        # Check structure
        self.assertIn('query', cases[0])
        self.assertIn('expected', cases[0])
        self.assertIn("synthetic", cases[0]['tags'])

if __name__ == '__main__':
    unittest.main()
