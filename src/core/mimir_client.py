"""
[Ω] Mimir Client: The Synaptic Link (v2.0)
Lore: "A Raven's mind is linked to the Well by the threads of the Bifrost."
Purpose: Native Python Skill Client for triggering Gungnir capabilities.
Upgrade: Delegating procedural logic to Agent Skills via the Gungnir Control Plane.
"""

import asyncio
import json
import os
import sys
import subprocess
from pathlib import Path
from typing import Any, Optional

class MimirClient:
    """The central nervous system bridge for Python agents. Now Skill-centric."""

    def __init__(self):
        self.project_root = Path(__file__).resolve().parent.parent.parent
        self.venv_python = self.project_root / ".venv" / "Scripts" / "python.exe"
        if not self.venv_python.exists():
            self.venv_python = Path(sys.executable)
        self.cstar_dispatcher = self.project_root / "src" / "core" / "cstar_dispatcher.py"

    def _call_skill(self, skill: str, args: list[str]) -> str:
        """Invokes a Sovereign Agent Skill via the Gungnir Dispatcher."""
        env = os.environ.copy()
        env["PYTHONPATH"] = str(self.project_root)
        
        try:
            result = subprocess.run(
                [str(self.venv_python), str(self.cstar_dispatcher), skill, *args],
                capture_output=True,
                text=True,
                env=env,
                check=True
            )
            return result.stdout
        except subprocess.CalledProcessError as e:
            print(f"[ERROR] Skill '{skill}' failed: {e.stderr}", file=sys.stderr)
            return ""

    async def get_file_intent(self, filepath: str) -> str | None:
        """Consults the Oracle skill for sector intelligence."""
        # [ALFRED]: We now use the Oracle skill to retrieve intent rather than raw MCP
        output = self._call_skill("oracle", ["--query", f"What is the intent of {filepath}?"])
        return output if output else "The Oracle is silent."

    async def think(self, query: str, system_prompt: str | None = None) -> str | None:
        """Delegates high-fidelity thinking to the Gungnir Oracle Skill."""
        args = ["--query", query]
        if system_prompt:
            args.extend(["--system_prompt", system_prompt])
            
        return self._call_skill("oracle", args)

    async def index_sector(self, filepath: str) -> bool:
        """Triggers the Scan Skill for a specific path."""
        output = self._call_skill("scan", ["--path", filepath])
        return "[🔱] Scan complete" in output or "Success" in output

    async def close(self):
        """No persistent sessions needed in the decoupled stack."""
        pass

# Global Singleton instance for shared usage
mimir = MimirClient()

async def test_mimir():
    """Diagnostic check for the Synaptic Link."""
    print("[INFO] Testing Skill-based Synaptic Link...")
    intent = await mimir.get_file_intent("src/core/cstar_dispatcher.py")
    if intent:
        print(f"[SUCCESS] Oracle responded:\n{intent[:200]}...")
    else:
        print("[FAILURE] The Skill repository did not respond.")

if __name__ == "__main__":
    asyncio.run(test_mimir())
