
import unittest
from pathlib import Path
from src.cstar.core.rpc import SovereignRPC
import sqlite3
import json
import os

class TestRPCPhase89(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parent.parent
        self.rpc = SovereignRPC(self.root)
        self.db_path = self.root / ".stats" / "pennyone.db"
        self.ledger_path = self.root / ".agents" / "tech_debt_ledger.json"

    def test_get_recent_traces_empty(self):
        # Even if DB doesn't exist, it should return an empty list
        traces = self.rpc.get_recent_traces()
        self.assertIsInstance(traces, list)

    def test_get_architectural_suggestions_parsing(self):
        # Create a mock ledger if it doesn't exist for the test
        original_content = None
        if self.ledger_path.exists():
            original_content = self.ledger_path.read_text(encoding='utf-8')
        
        mock_data = {
            "top_targets": [
                {
                    "file": "test_file.py",
                    "priority": "CRITICAL",
                    "justification": "[ALFRED]: 'Test justification.'"
                }
            ]
        }
        
        try:
            self.ledger_path.parent.mkdir(parents=True, exist_ok=True)
            self.ledger_path.write_text(json.dumps(mock_data), encoding='utf-8')
            
            suggestions = self.rpc.get_architectural_suggestions()
            self.assertEqual(len(suggestions), 1)
            self.assertIn("[CRITICAL] test_file.py: Test justification.", suggestions[0])
        finally:
            if original_content:
                self.ledger_path.write_text(original_content, encoding='utf-8')
            elif self.ledger_path.exists():
                self.ledger_path.unlink()

    def test_get_dashboard_state_structure(self):
        state = self.rpc.get_dashboard_state()
        self.assertIn("vitals", state)
        self.assertIn("tasks", state)
        self.assertIn("traces", state)
        self.assertIn("suggestions", state)
        self.assertIn("persona", state)

if __name__ == "__main__":
    unittest.main()
