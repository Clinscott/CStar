"""
[Ω] Mimir Client: The Synaptic Link (v2.1)
Lore: "A Raven's mind is linked to the Well by the threads of the Bifrost."
Purpose: Native Python bridge for channeling the Host Agent's intelligence.
Upgrade: Uses the local environment agent gateway (Sampling) via localhost:4000.
"""

import asyncio
import json
import os
import sys
import requests
from pathlib import Path
from typing import Any, Optional

class MimirClient:
    """The central nervous system bridge. Channels the Host Agent's One Mind."""

    def __init__(self, port: int = 4000):
        self.base_url = f"http://localhost:{port}/api/mimir"
        self.project_root = Path(__file__).resolve().parent.parent.parent

    async def think(self, query: str, system_prompt: str | None = None) -> str | None:
        """
        Channels the Host Agent's intelligence (Sampling).
        No API keys required; uses the environment's active mind.
        """
        payload = {
            "query": query,
            "system_prompt": system_prompt,
            "stream": False
        }
        
        try:
            # [🔱] THE SYNAPTIC STRIKE: Calling the host agent gateway
            response = requests.post(
                f"{self.base_url}/think", 
                json=payload, 
                timeout=60
            )
            response.raise_for_status()
            data = response.json()
            return data.get("reply") or data.get("text")
        except Exception as e:
            print(f"[ALFRED]: \"The synaptic link to the Host is flickering, sir.\" ({e})", file=sys.stderr)
            return None

    async def get_file_intent(self, filepath: str) -> str | None:
        """Retrieves sector intelligence from the Host's memory."""
        try:
            response = requests.get(f"{self.base_url}/intent", params={"path": filepath})
            data = response.json()
            return data.get("intent")
        except Exception:
            return "The Well is silent for this sector."

    async def close(self):
        pass

# Global Singleton instance
mimir = MimirClient()

async def test_mimir():
    """Diagnostic check for the Synaptic Link."""
    print("[INFO] Testing Synaptic Link to Host Agent...")
    reply = await mimir.think("Hello from the internal matrix.")
    if reply:
        print(f"[SUCCESS] Host Agent responded: {reply[:100]}...")
    else:
        print("[FAILURE] The Host Agent is unreachable.")

if __name__ == "__main__":
    asyncio.run(test_mimir())
