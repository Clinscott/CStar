"""
[ENGINE] Campaign Updater
Lore: "Mimir's wisdom fuels the war effort."
Purpose: Bridges PennyOne mission successes to O.D.I.N. Protocol campaign updates.
"""

import sqlite3
import logging
from pathlib import Path
from typing import List, Dict, Any

from src.games.odin_protocol.engine.persistence import OdinPersistence
from src.games.odin_protocol.engine.models import UniverseState


class CampaignUpdater:
    """
    Synchronizes Agent successes from PennyOne with the O.D.I.N. Protocol campaign.
    """

    def __init__(self, project_root: str | Path) -> None:
        self.project_root = Path(project_root)
        self.persistence = OdinPersistence(self.project_root)
        self.db_path = self.project_root / ".stats" / "pennyone.db"

    def update_campaign(self) -> Dict[str, Any]:
        """
        Processes new mission traces and updates the universe state.
        """
        state = self.persistence.load_state()
        if not state:
            # Create a fresh state if none exists
            from src.games.odin_protocol.engine.logic import get_federated_seed
            seed = get_federated_seed(str(self.project_root))
            state_obj = UniverseState(seed=seed)
        else:
            state_obj = UniverseState.from_dict(state)

        new_traces = self._get_new_traces(state_obj.last_processed_trace_id)
        
        if not new_traces:
            return {"status": "NO_NEW_TRACES", "updates": 0}

        domination_gain = 0.0
        max_trace_id = state_obj.last_processed_trace_id
        
        for trace in new_traces:
            trace_id = trace['id']
            initial = trace['initial_score']
            final = trace['final_score']
            status = trace['status']

            if status == "SUCCESS" and final > initial:
                # Calculate gain: (final - initial) / 10
                # E.g., Logic score improvement from 5.0 to 7.0 = 0.2% domination
                gain = (final - initial) / 10.0
                domination_gain += gain
            
            if trace_id > max_trace_id:
                max_trace_id = trace_id

        # Apply updates
        state_obj.domination_percent = min(100.0, state_obj.domination_percent + domination_gain)
        state_obj.last_processed_trace_id = max_trace_id
        
        # Mutation charges increase based on significant milestones
        if state_obj.domination_percent > state_obj.max_percent_reached:
            state_obj.max_percent_reached = state_obj.domination_percent
            # For every 5% new domination, gain 1 mutation charge
            # This is a simplification
        
        outcome = f"Neural Alignment Sync. Gained {domination_gain:.2f}% domination."
        self.persistence.save_state(state_obj.to_dict(), "Midgard", outcome)

        return {
            "status": "SUCCESS",
            "updates": len(new_traces),
            "domination_gain": round(domination_gain, 2),
            "new_percent": round(state_obj.domination_percent, 2)
        }

    def _get_new_traces(self, last_id: int) -> List[Dict[str, Any]]:
        """
        Retrieves unprocessed mission traces from PennyOne DB.
        """
        if not self.db_path.exists():
            logging.warning(f"Database not found: {self.db_path}")
            return []

        try:
            conn = sqlite3.connect(str(self.db_path))
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute(
                "SELECT * FROM mission_traces WHERE id > ? ORDER BY id ASC",
                (last_id,)
            )
            rows = cursor.fetchall()
            conn.close()
            
            return [dict(row) for row in rows]
        except sqlite3.Error as e:
            logging.error(f"Database Error: {e}")
            return []


if __name__ == "__main__":
    # Self-execution for testing/manual sync
    import sys
    root = Path(__file__).resolve().parents[4]
    updater = CampaignUpdater(root)
    result = updater.update_campaign()
    print(result)
