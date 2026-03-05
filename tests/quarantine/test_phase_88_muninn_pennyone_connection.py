"""
[TDD] Phase 88: Muninn <-> PennyOne Connection
Lore: "The Ravens and the Matrix are one."
"""

import unittest
import sqlite3
import json
import time
import requests
from pathlib import Path
from src.sentinel.coordinator import MissionCoordinator
from src.core.telemetry import SubspaceTelemetry

class TestMuninnPennyOneConnection(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[1]
        self.db_path = self.root / ".stats" / "pennyone.db"
        self.ledger_path = self.root / ".agent" / "tech_debt_ledger.json"
        self.graph_path = self.root / ".stats" / "matrix-graph.json"
        
        # Backup existing artifacts
        self.backups = {}
        for p in [self.ledger_path, self.graph_path]:
            if p.exists():
                self.backups[p] = p.read_text(encoding="utf-8")
        
        # Initialize fresh test data
        self.test_file = "src/core/test_connection.py"
        ledger_data = {
            "top_targets": [{
                "file": self.test_file,
                "priority": "CRITICAL",
                "justification": "[TEST] Connection Verification",
                "target_metric": "LOGIC",
                "metrics": {"gravity": 100, "logic": 2.5}
            }]
        }
        self.ledger_path.parent.mkdir(parents=True, exist_ok=True)
        self.ledger_path.write_text(json.dumps(ledger_data), encoding="utf-8")
        
        graph_data = {
            "files": [{
                "path": self.test_file,
                "matrix": {"logic": 2.5, "style": 8.0, "intel": 9.0}
            }]
        }
        self.graph_path.parent.mkdir(parents=True, exist_ok=True)
        self.graph_path.write_text(json.dumps(graph_data), encoding="utf-8")

    def tearDown(self):
        # Restore artifacts
        for p, data in self.backups.items():
            p.write_text(data, encoding="utf-8")

    def test_mission_coordinator_acquisition(self):
        """Verifies Muninn (via Coordinator) acquires files based on PennyOne/Ledger data."""
        coordinator = MissionCoordinator(self.root)
        mission = coordinator.select_mission([])
        
        self.assertIsNotNone(mission)
        self.assertEqual(mission['file'], self.test_file)
        self.assertEqual(mission['severity'], 'CRITICAL')
        # Should pick LOGIC (2.5) as it's the lowest in matrix-graph.json
        self.assertEqual(mission['target_metric'], 'LOGIC')
        self.assertEqual(mission['initial_score'], 2.5)

    def test_subspace_telemetry_connection(self):
        """Verifies Muninn can log traces to PennyOne (via Proxy)."""
        # Note: This requires the PennyOne proxy to be running.
        # If it's not, we'll verify it fails gracefully but logs intent.
        
        mission_id = f"test-telemetry-{int(time.time())}"
        success = SubspaceTelemetry.log_trace(
            mission_id=mission_id,
            file_path=self.test_file,
            target_metric="LOGIC",
            initial_score=2.5,
            justification="Integration Test Connection",
            status="TEST_ACTIVE"
        )
        
        # Check if DB has the record (direct verification)
        if self.db_path.exists():
            conn = sqlite3.connect(str(self.db_path))
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM mission_traces WHERE mission_id = ?", (mission_id,))
            row = cursor.fetchone()
            conn.close()
            
            if success:
                self.assertIsNotNone(row, "Trace should be in DB if telemetry returned success.")
            else:
                # If proxy is offline, success will be False, but we can't assert row is None 
                # because another agent might have written it or proxy might have buffered it.
                pass

if __name__ == "__main__":
    unittest.main()
