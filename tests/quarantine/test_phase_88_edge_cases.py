"""
[TDD] Phase 88: Edge Case Crucible
Lore: "Odin's Eye sees every flaw."
"""

import unittest
import sqlite3
import json
import time
from pathlib import Path
from src.games.odin_protocol.engine.campaign_updater import CampaignUpdater
from src.games.odin_protocol.engine.models import UniverseState

class TestPhase88EdgeCases(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[1]
        self.db_path = self.root / ".stats" / "pennyone.db"
        self.save_path = self.root / "odin_protocol" / "save_state.json"
        
        # Backup existing state
        if self.save_path.exists():
            self.backup = self.save_path.read_text()
        else:
            self.backup = None
            
        # Find current max ID
        self.conn = sqlite3.connect(str(self.db_path))
        self.cursor = self.conn.cursor()
        self.cursor.execute("SELECT MAX(id) FROM mission_traces")
        self.start_id = self.cursor.fetchone()[0] or 0
        
        # Initialize state at 99.8% to test the 100% cap
        state = UniverseState(seed="EDGE_TEST", domination_percent=99.8, last_processed_trace_id=self.start_id)
        self.save_path.write_text(json.dumps(state.to_dict(), indent=4))

    def tearDown(self):
        if self.backup:
            self.save_path.write_text(self.backup)
        self.conn.close()

    def test_regression_and_failure_isolation(self):
        ts = int(time.time() * 1000)
        # 1. Regression: Final < Initial (8.0 -> 5.0) -> Gain 0
        self.cursor.execute("INSERT INTO mission_traces (mission_id, file_path, target_metric, initial_score, final_score, justification, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                           ('edge-regress', 'regress.py', 'LOGIC', 8.0, 5.0, 'Failure', 'SUCCESS', ts))
        
        # 2. Status Failure: (5.0 -> 9.0 but status=FAILURE) -> Gain 0
        self.cursor.execute("INSERT INTO mission_traces (mission_id, file_path, target_metric, initial_score, final_score, justification, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                           ('edge-fail', 'fail.py', 'LOGIC', 5.0, 9.0, 'Broke tests', 'FAILURE', ts + 1))
        
        # 3. Valid Success: (5.0 -> 7.0) -> Gain 0.2
        self.cursor.execute("INSERT INTO mission_traces (mission_id, file_path, target_metric, initial_score, final_score, justification, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                           ('edge-valid', 'valid.py', 'LOGIC', 5.0, 7.0, 'Good fix', 'SUCCESS', ts + 2))
        
        self.conn.commit()
        
        updater = CampaignUpdater(self.root)
        result = updater.update_campaign()
        
        # Total gain should be exactly 0.2
        self.assertEqual(result['updates'], 3)
        self.assertAlmostEqual(result['domination_gain'], 0.2)
        # 99.8 + 0.2 = 100.0
        self.assertAlmostEqual(result['new_percent'], 100.0)

    def test_domination_cap(self):
        ts = int(time.time() * 1000)
        # Massive gain: (0.0 -> 10.0) -> Gain 1.0
        self.cursor.execute("INSERT INTO mission_traces (mission_id, file_path, target_metric, initial_score, final_score, justification, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                           ('edge-cap', 'cap.py', 'LOGIC', 0.0, 10.0, 'Perfect', 'SUCCESS', ts))
        self.conn.commit()
        
        updater = CampaignUpdater(self.root)
        result = updater.update_campaign()
        
        # 99.8 + 1.0 = 100.8 -> Capped at 100.0
        self.assertEqual(result['new_percent'], 100.0)

if __name__ == "__main__":
    unittest.main()
