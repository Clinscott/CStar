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
from unittest.mock import MagicMock, patch

# Bootstrap
from src.sentinel._bootstrap import SovereignBootstrap

SovereignBootstrap.execute()

from src.sentinel.muninn import Muninn
from src.cstar.core.uplink import AntigravityUplink

FIXTURES_DIR = Path(__file__).parent.parent.parent / "tests" / "fixtures" / "ravens_responses"


class ResponseRecorder:
    """
    Wraps an AntigravityUplink and records every send_payload call.
    """

    def __init__(self, real_uplink: AntigravityUplink) -> None:
        self.real_uplink = real_uplink
        self.recordings = []

    async def record_call(self, query: str, context: dict = None):
        """Intercept send_payload, record request+response."""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")

        try:
            response = await self.real_uplink.send_payload(query, context)
            response_text = response.get("data", {}).get("raw", "")

            self.recordings.append({
                "timestamp": timestamp,
                "persona": (context or {}).get("persona", "unknown"),
                "prompt_preview": str(query)[:500],
                "response_text": response_text,
                "success": response.get("status") == "success",
            })
            return response
        except Exception as e:
            self.recordings.append({
                "timestamp": timestamp,
                "persona": (context or {}).get("persona", "unknown"),
                "prompt_preview": str(query)[:500],
                "response_text": "",
                "success": False,
                "error": str(e),
            })
            raise

    def save(self, path: Path) -> None:
        """Save all recordings to JSON."""
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            # Use default=str to handle MagicMock objects
            json.dump(self.recordings, f, indent=2, ensure_ascii=False, default=str)
        print(f"[HARVEST] Saved {len(self.recordings)} recordings to {path}")


class Harvester:
    """[O.D.I.N.] Orchestration logic for AI response harvesting."""

    @staticmethod
    async def execute(cycles: int = 5):
        """
        Run N cycles of Muninn against CorvusStar with recording.
        Captures prompt/response pairs for offline verification and hardening.
        """
        project_root = Path(__file__).parent.parent.parent.resolve()
        output_path = FIXTURES_DIR / "mock_responses.json"

        # Create real uplink
        real_uplink = AntigravityUplink()

        # Wrap with recorder
        recorder = ResponseRecorder(real_uplink)

        # Create a proxy uplink that looks like the real one
        from unittest.mock import AsyncMock
        proxy_uplink = AsyncMock(wraps=real_uplink)
        proxy_uplink.send_payload.side_effect = recorder.record_call

        print(f"[HARVEST] Starting {cycles} cycles against {project_root.name}")
        print(f"[HARVEST] Output: {output_path}")

        for cycle in range(cycles):
            print(f"\n{'='*60}")
            print(f"[HARVEST] Cycle {cycle + 1}/{cycles}")
            print(f"{'='*60}")

            try:
                # We patch Muninn's uplink with our proxy
                with patch("src.sentinel.muninn.AntigravityUplink", return_value=proxy_uplink):
                    raven = Muninn(str(project_root))
                    await raven.run_cycle()
            except Exception as e:
                print(f"[HARVEST] Cycle {cycle + 1} crashed: {e}")

            # Save after each cycle (in case of crash)
            recorder.save(output_path)

        print(f"\n[HARVEST] Complete. {len(recorder.recordings)} total responses captured.")
        return recorder.recordings


if __name__ == "__main__":
    import asyncio
    parser = argparse.ArgumentParser(description="Harvest live AI responses for mock bank")
    parser.add_argument("--cycles", type=int, default=5, help="Number of cycles to run")
    args = parser.parse_args()
    asyncio.run(Harvester.execute(args.cycles))
