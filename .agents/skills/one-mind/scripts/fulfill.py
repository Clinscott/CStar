import sqlite3
import json
import sys
import os
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
DB_PATH = PROJECT_ROOT / ".agents" / "synapse.db"

def fulfill_synapse():
    if not DB_PATH.exists():
        print(f"[ERROR] Synapse DB not found at {DB_PATH}")
        return

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    
    try:
        # 1. Get PENDING rows
        cursor = conn.cursor()
        rows = cursor.execute("SELECT id, prompt FROM synapse WHERE status = 'PENDING' ORDER BY id ASC").fetchall()
        
        if not rows:
            print("No pending synapse requests found.")
            return

        print(f"FOUND {len(rows)} PENDING REQUESTS.")
        
        for row in rows:
            synapse_id = row['id']
            prompt = row['prompt']
            
            print(f"\n--- SYNAPSE REQUEST {synapse_id} ---")
            print(prompt)
            print("--- END PROMPT ---")
            
            # In a manual run by an agent, the agent sees this output and then provides the response.
            # We provide a marker for the agent to follow.
            print(f"\n[ACTION] Agent: Please provide the JSON response for Synapse ID {synapse_id} now.")
            
            # For automation, we wait for input, but since we want the agent to use its own turn,
            # we might just stop after the first one or output all of them.
            # To make it interactive for me, I will just output the first one and exit, 
            # or output all and let the agent (me) handle them in one go.
            
        print("\n[INSTRUCTION]: I have listed the pending prompts above. Please analyze them and provide the JSON arrays.")
        print("Once you have the JSON, you can use 'cstar oracle --id <id> --response <json>' or I can provide a save-response command.")

    finally:
        conn.close()

if __name__ == "__main__":
    fulfill_synapse()
