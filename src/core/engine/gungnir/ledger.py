import argparse
import json
import os
import uuid
from datetime import datetime

"""
Identity: Alfred (The Butler)
Purpose: Maintain the accounts and records for the Gungnir Engine.
The Butler's Ledger ensures the meticulous preservation of flight history.
"""

def manage_ledger(ledger_path, target, decision, score, llr, observations):
    # Initialize structure if ledger doesn't exist
    if not os.path.exists(ledger_path):
        data = {
            "project_name": "CStar-Gungnir",
            "global_project_health_score": 0.0,
            "flight_history": []
        }
    else:
        with open(ledger_path) as f:
            data = json.load(f)

    # Append new entry
    new_entry = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.utcnow().isoformat(),
        "target": target,
        "decision": decision,
        "alignment_score": score,
        "llr": float(llr),
        "observations": [int(o) for o in observations]
    }
    data["flight_history"].append(new_entry)

    # Recalculate GPHS (Moving average of score for Accepted flights)
    accepted_scores = [h["alignment_score"] for h in data["flight_history"] if h["decision"] == "Accept"]
    if accepted_scores:
        data["global_project_health_score"] = sum(accepted_scores) / len(accepted_scores)

    # Write back to JSON
    with open(ledger_path, 'w') as f:
        json.dump(data, f, indent=4)

    print(f"Ledger updated. Current GPHS: {data['global_project_health_score']:.2f}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="[ALFRED] The Butler's Ledger: Gungnir Memory Manager")
    parser.add_argument("--ledger", required=True, help="Path to the JSON ledger")
    parser.add_argument("--target", required=True, help="Target file evaluated")
    parser.add_argument("--decision", required=True, help="SPRT Decision (Accept/Reject/Continue)")
    parser.add_argument("--score", type=float, required=True, help="Alignment score")
    parser.add_argument("--llr", type=float, required=True, help="Final Log-Likelihood Ratio")
    parser.add_argument("--obs", nargs='+', required=True, help="Array of observations")

    args = parser.parse_args()
    manage_ledger(args.ledger, args.target, args.decision, args.score, args.llr, args.obs)
