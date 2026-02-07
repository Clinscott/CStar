import unittest
import json
import os
import shutil
import tempfile
from pathlib import Path
from importlib.machinery import SourceFileLoader

# Load the script dynamically
SCRIPT_PATH = Path(__file__).parent.parent / ".agent" / "scripts" / "merge_traces.py"
merge_script = SourceFileLoader("merge_traces", str(SCRIPT_PATH)).load_module()

class TestMergeTraces(unittest.TestCase):
    def setUp(self):
        # Create temp environment
        self.test_dir = Path(tempfile.mkdtemp())
        self.source_dir = self.test_dir / "incoming"
        self.source_dir.mkdir()
        self.target_file = self.test_dir / "data.json"
        
        # Initial Dataset
        self.initial_data = {
            "test_cases": [
                {"query": "initial case", "expected": "initial_match", "tags": ["base"]}
            ]
        }
        with open(self.target_file, 'w') as f:
            json.dump(self.initial_data, f)
            
    def tearDown(self):
        shutil.rmtree(self.test_dir)

    def test_add_new_trace(self):
        # Create a new trace file
        new_trace = {
            "query": "new case",
            "match": "new_match",
            "score": 0.9,
            "persona": "ALFRED"
        }
        with open(self.source_dir / "trace_1.json", 'w') as f:
            json.dump(new_trace, f)
            
        merge_script.merge_traces(self.source_dir, self.target_file)
        
        with open(self.target_file, 'r') as f:
            data = json.load(f)
            
        # Verify count
        self.assertEqual(len(data['test_cases']), 2)
        
        # Verify content
        case = next(c for c in data['test_cases'] if c['query'] == "new case")
        self.assertEqual(case['expected'], "new_match")
        self.assertIn("ALFRED", case['tags'])
        
        # Verify archive
        self.assertTrue((self.source_dir / "processed" / "trace_1.json").exists())

    def test_conflict_resolution(self):
        # Trace conflicts with initial case
        update_trace = {
            "query": "initial case",
            "match": "updated_match", # Changed logic
            "score": 0.95
        }
        with open(self.source_dir / "trace_update.json", 'w') as f:
            json.dump(update_trace, f)

        merge_script.merge_traces(self.source_dir, self.target_file)
        
        with open(self.target_file, 'r') as f:
            data = json.load(f)
            
        # Verify NO new case added
        self.assertEqual(len(data['test_cases']), 1)
        
        # Verify content updated
        case = data['test_cases'][0]
        self.assertEqual(case['expected'], "updated_match") 
        self.assertIn("real-user", case['tags'])

    def test_invalid_json_handling(self):
        with open(self.source_dir / "bad.json", 'w') as f:
            f.write("{ invalid json file ]")
            
        merge_script.merge_traces(self.source_dir, self.target_file)
        
        # Should not crash, file should be moved to failed
        self.assertTrue((self.source_dir / "failed" / "bad.json").exists())

if __name__ == '__main__':
    unittest.main()
