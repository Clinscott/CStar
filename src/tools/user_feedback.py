#!/usr/bin/env python3
"""
[TOOL] User Feedback Logger
Lore: "The Master's word is law. If the Gungnir deviates, the record shall reflect its failure."
"""

import json
import sys
from datetime import datetime
from pathlib import Path

def log_feedback(score: int, comment: str, target_file: str = "unknown") -> None:
    return FeedbackOrchestrator.execute(score, comment, target_file)

class FeedbackOrchestrator:
    """[O.D.I.N.] Orchestration logic for user-driven logic feedback and regression capture."""

    @staticmethod
    def execute(score: int, comment: str, target_file: str = "unknown") -> None:
        """Logs user feedback to a JSONL file for Muninn to ingest."""
        # Resolve project root (script is in src/tools/)
        project_root = Path(__file__).resolve().parents[2]
        feedback_path = project_root / ".agent" / "feedback.jsonl"
        feedback_path.parent.mkdir(parents=True, exist_ok=True)

        entry = {
            "timestamp": datetime.now().isoformat(),
            "score": score,  # 1 (Poor) to 5 (Excellent)
            "comment": comment,
            "target_file": target_file
        }

        with feedback_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")

        print(f"Feedback recorded: {score}/5 - {comment}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python user_feedback.py <score> <comment> [target_file]")
        sys.exit(1)

    try:
        score_val = int(sys.argv[1])
        comment_val = sys.argv[2]
        target_val = sys.argv[3] if len(sys.argv) > 3 else "unknown"
        FeedbackOrchestrator.execute(score_val, comment_val, target_val)
    except Exception as e:
        print(f"Error logging feedback: {e}")
        sys.exit(1)
