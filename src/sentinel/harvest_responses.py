"""
Response Harvester: Captures live AI responses for the mock bank.
Identity: ODIN
Purpose: Wraps SovereignFish with a recording proxy to intercept and cache
AI generate_content calls. Produces mock_responses.json for offline testing.

Usage:
    python -m src.sentinel.harvest_responses --cycles 5
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
from unittest.mock import MagicMock

# Bootstrap
from src.sentinel._bootstrap import bootstrap
bootstrap()

from src.sentinel.muninn import Muninn as SovereignFish
from src.core.annex import HeimdallWarden
from src.core.ui import HUD


FIXTURES_DIR = Path(__file__).parent.parent.parent / "tests" / "fixtures" / "ravens_responses"


class ResponseRecorder:
    """
    Wraps a real genai client and records every generate_content call.
    """

    def __init__(self, real_client):
        self.real_client = real_client
        self.recordings = []

    def record_call(self, *args, **kwargs):
        """Intercept generate_content, record request+response."""
        model = kwargs.get("model") or (args[0] if args else "unknown")
        prompt = kwargs.get("contents") or (args[1] if len(args) > 1 else "")

        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")

        try:
            response = self.real_client.models.generate_content(*args, **kwargs)
            response_text = response.text if response and response.text else ""

            self.recordings.append({
                "timestamp": timestamp,
                "model": model,
                "prompt_preview": str(prompt)[:500],
                "response_text": response_text,
                "success": True,
            })
            return response
        except Exception as e:
            self.recordings.append({
                "timestamp": timestamp,
                "model": model,
                "prompt_preview": str(prompt)[:500],
                "response_text": "",
                "success": False,
                "error": str(e),
            })
            raise

    def save(self, path: Path):
        """Save all recordings to JSON."""
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            # Use default=str to handle MagicMock objects
            json.dump(self.recordings, f, indent=2, ensure_ascii=False, default=str)
        print(f"[HARVEST] Saved {len(self.recordings)} recordings to {path}")


def harvest(cycles: int = 5):
    """
    [ODIN] Run N cycles of SovereignFish against CorvusStar with recording.
    Captures prompt/response pairs for offline verification and hardening.
    
    Args:
        cycles: Number of autonomous learning cycles to trigger.
        
    Returns:
        A list of captured response dictionaries.
    """
    project_root = Path(__file__).parent.parent.parent.resolve()
    output_path = FIXTURES_DIR / "mock_responses.json"

    # Verify API key
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("[HARVEST] ERROR: GOOGLE_API_KEY not set. Cannot harvest.")
        sys.exit(1)

    # Create real client
    from google import genai
    real_client = genai.Client(api_key=api_key)

    # Wrap with recorder
    recorder = ResponseRecorder(real_client)

    # Create a proxy client that looks like the real one
    proxy_client = MagicMock(wraps=real_client)
    proxy_client.models.generate_content.side_effect = recorder.record_call

    print(f"[HARVEST] Starting {cycles} cycles against {project_root.name}")
    print(f"[HARVEST] Output: {output_path}")

    for cycle in range(cycles):
        print(f"\n{'='*60}")
        print(f"[HARVEST] Cycle {cycle + 1}/{cycles}")
        print(f"{'='*60}")

        try:
            fish = SovereignFish(str(project_root), client=proxy_client)
            fish.run()
        except Exception as e:
            print(f"[HARVEST] Cycle {cycle + 1} crashed: {e}")

        # Save after each cycle (in case of crash)
        recorder.save(output_path)

    print(f"\n[HARVEST] Complete. {len(recorder.recordings)} total responses captured.")
    return recorder.recordings


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Harvest live AI responses for mock bank")
    parser.add_argument("--cycles", type=int, default=5, help="Number of cycles to run")
    args = parser.parse_args()
    harvest(args.cycles)
