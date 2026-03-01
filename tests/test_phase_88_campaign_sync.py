"""
[TDD] Phase 88: Campaign Synchronization
Lore: "Mimir's Wisdom must be accurate."
"""

import unittest
import sqlite3
import json
import time
from pathlib import Path
from src.games.odin_protocol.engine.campaign_updater import CampaignUpdater
from src.games.odin_protocol.engine.persistence import OdinPersistence
from src.games.odin_protocol.engine.models import UniverseState

class TestCampaignSync(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[1]
        self.db_path = self.root / ".stats" / "pennyone.db"
        self.save_path = self.root / "odin_protocol" / "save_state.json"
        
        # Backup existing state
        if self.save_path.exists():
            self.backup = self.save_path.read_text()
        else:
            self.backup = None
            
        # Find current max ID to ensure we only process NEW traces
        self.conn = sqlite3.connect(str(self.db_path))
        self.cursor = self.conn.cursor()
        self.cursor.execute("SELECT MAX(id) FROM mission_traces")
        self.start_id = self.cursor.fetchone()[0] or 0
            
        # Initialize fresh state for testing with the current max ID
        state = UniverseState(seed="TEST_SEED", domination_percent=10.0, last_processed_trace_id=self.start_id)
        self.save_path.write_text(json.dumps(state.to_dict(), indent=4))
        
        # Seed two successes (0.4 gain each -> +0.8 total)
        self.ts = int(time.time() * 1000)
        self.mission_prefix = f"sync-test-{self.ts}"
        
        self.cursor.execute("""
            INSERT INTO mission_traces 
            (mission_id, file_path, target_metric, initial_score, final_score, justification, status, timestamp) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (f'{self.mission_prefix}-1', 'file1.py', 'LOGIC', 5.0, 9.0, 'Huge Gain', 'SUCCESS', self.ts))
        
        self.cursor.execute("""
            INSERT INTO mission_traces 
            (mission_id, file_path, target_metric, initial_score, final_score, justification, status, timestamp) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (f'{self.mission_prefix}-2', 'file2.py', 'LOGIC', 4.0, 8.0, 'Huge Gain', 'SUCCESS', self.ts + 1))
        
        self.conn.commit()

    def tearDown(self):
        # Restore state
        if self.backup:
            self.save_path.write_text(self.backup)
        self.conn.close()

    def test_domination_gain_calculation(self):
        updater = CampaignUpdater(self.root)
        result = updater.update_campaign()
        
        # Each gain: (final-initial)/10 = (9-5)/10 = 0.4. Two traces = 0.8.
        # Starting percent was 10.0. New should be 10.8.
        
        self.assertEqual(result['status'], 'SUCCESS')
        self.assertEqual(result['updates'], 2)
        self.assertAlmostEqual(result['domination_gain'], 0.8)
        self.assertAlmostEqual(result['new_percent'], 10.8)
        
        # Verify persistence
        persisted = json.loads(self.save_path.read_text())
        self.assertAlmostEqual(persisted['domination_percent'], 10.8)
        self.assertTrue(persisted['last_processed_trace_id'] > self.start_id)

    def test_no_double_processing(self):
        updater = CampaignUpdater(self.root)
        # First pass
        updater.update_campaign()
        
        # Second pass - should find nothing new
        result = updater.update_campaign()
        self.assertEqual(result['status'], 'NO_NEW_TRACES')
        self.assertEqual(result['updates'], 0)

if __name__ == "__main__":
    unittest.main()
