"""
[Ω] Mimir Client: The Synaptic Link (v2.2)
Lore: "A Raven's mind is linked to the Well by the threads of the Bifrost."
Purpose: Native Python bridge for channeling the Host Agent's intelligence.
Upgrade: No HTTP Gateways. No API Keys. Calls the 'oracle' skill via cstar.
"""

import asyncio
import os
import sys
import subprocess
from pathlib import Path
from typing import Any, Optional

class MimirClient:
    """The central nervous system bridge. Channels the Host Agent's One Mind."""

    def __init__(self):
        self.project_root = Path(__file__).resolve().parent.parent.parent
        self.venv_python = self.project_root / ".venv" / "Scripts" / "python.exe"
        if not self.venv_python.exists():
            self.venv_python = Path(sys.executable)
        self.cstar_dispatcher = self.project_root / "src" / "core" / "cstar_dispatcher.py"

    async def think(self, query: str, system_prompt: str | None = None) -> str | None:
        """
        Channels the Host Agent's intelligence by triggering the 'oracle' skill.
        The 'oracle' skill is now a gateway to the MCP 'think' tool (Sampling).
        """
        env = os.environ.copy()
        env["PYTHONPATH"] = str(self.project_root)
        
        args = ["--query", query]
        if system_prompt:
            args.extend(["--system_prompt", system_prompt])

        try:
            # [🔱] THE SYNAPTIC ASCENSION: Using cstar dispatcher to run 'oracle'
            result = subprocess.run(
                [str(self.venv_python), str(self.cstar_dispatcher), "oracle", *args],
                capture_output=True,
                text=True,
                env=env,
                check=True,
                encoding='utf-8'
            )
            return result.stdout.strip()
        except subprocess.CalledProcessError as e:
            print(f"[ALFRED]: \"The synaptic link to the Host is flickering, sir.\"", file=sys.stderr)
            return None

    async def get_file_intent(self, filepath: str) -> str | None:
        """Retrieves sector intelligence via the oracle skill."""
        return await self.think(f"What is the intent of sector: {filepath}?")

    async def close(self):
        pass

# Global Singleton instance
mimir = MimirClient()

async def test_mimir():
    """Diagnostic check for the Synaptic Link."""
    print("[INFO] Testing Synaptic Link to Host Agent (via cstar)...")
    reply = await mimir.think("Hello from the internal matrix.")
    if reply:
        print(f"[SUCCESS] Host Agent responded via Oracle.")
    else:
        print("[FAILURE] The Host Agent is unreachable.")

if __name__ == "__main__":
    asyncio.run(test_mimir())
