"""
[Ω] Antigravity Uplink (v7.0).
Lore: "A Raven's mind is linked to the Well by the threads of the Bifrost."
Purpose: Universal Synaptic Bridge. Delegates thinking to MCP Sampling (mimir) or CLI fallback.
"""

import asyncio
import json
import os
import sys
import tempfile
import re
from pathlib import Path
from typing import Any, Optional

# Shared Bootstrap
project_root = Path(__file__).resolve().parents[3]
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.core.sovereign_hud import SovereignHUD
from src.core.mimir_client import mimir

def clean_cli_output(text: str) -> str:
    """Strips ANSI codes and extracts the LAST full JSON object or array via brace counting."""
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    text = ansi_escape.sub('', text)

    def extract_balanced(s, start_char, end_char):
        end_idx = s.rfind(end_char)
        if end_idx == -1: return ""
        stack = 0
        for i in range(end_idx, -1, -1):
            if s[i] == end_char: stack += 1
            elif s[i] == start_char: stack -= 1
            if stack == 0:
                return s[i:end_idx+1]
        return ""

    obj = extract_balanced(text, '{', '}')
    arr = extract_balanced(text, '[', ']')
    return obj if text.rfind('}') > text.rfind(']') else arr

class AntigravityUplink:
    """
    [Ω] The Synaptic Uplink.
    Prioritizes high-fidelity MCP Sampling via Mimir. 
    Fallbacks to direct CLI execution if the Synaptic Link is offline.
    """

    def __init__(self, *args, **kwargs):
        """[🔱] Backward compatibility for legacy signatures."""
        self.api_key = kwargs.get("api_key") or (args[0] if args else None)

    async def send_payload(self, query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Sends a payload to the Host Oracle."""
        
        # [🔱] TIER 1: Synaptic Link (MCP Sampling)
        try:
            system_prompt = context.get("system_prompt") if context else None
            # mimir.think is the recursive-safe bridge
            result = await mimir.think(query, system_prompt=system_prompt)
            if result:
                return {"status": "success", "data": {"raw": result}}
        except Exception as e:
            SovereignHUD.persona_log("WARN", f"Synaptic Link failure: {e}. Attempting Direct Strike fallback...")

        # [🔱] TIER 2: Direct Strike (CLI Fallback)
        # This is the recursive-prone method, used only if Mimir is unavailable.
        return await self._direct_strike(query, context)

    async def _direct_strike(self, query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Legacy fallback using recursive CLI spawning."""
        out_fd, out_path = tempfile.mkstemp(suffix=".out")
        in_fd, in_path = tempfile.mkstemp(suffix=".in")
        os.close(out_fd)
        os.close(in_fd)
        
        with open(in_path, "w", encoding="utf-8") as f:
            f.write(query)

        env = os.environ.copy()
        env["TERM"] = "dumb"
        env["PYTHONIOENCODING"] = "utf-8"

        try:
            entry_point = r"C:\Users\Craig\AppData\Roaming\npm\node_modules\@google\gemini-cli\dist\index.js"
            # Use --prompt for headless execution
            # Note: This is where recursion deadlocks happen if tools are triggered
            cmd = f'node --no-warnings "{entry_point}" --prompt "{query}" --output-format json'
            
            proc = await asyncio.create_subprocess_shell(cmd, env=env)
            await asyncio.wait_for(proc.wait(), timeout=180.0)
            
            raw = Path(out_path).read_text(encoding="utf-8", errors="replace")
            json_str = clean_cli_output(raw)
            
            if not json_str:
                return {"status": "error", "message": "Oracle Silence (Empty Response)"}
            
            data = json.loads(json_str)
            response_text = data.get("response") or data.get("content") or str(data)
            return {"status": "success", "data": {"raw": response_text}}

        except Exception as e:
            return {"status": "error", "message": f"Direct Strike failure: {str(e)}"}
        finally:
            for p in [out_path, in_path]:
                if os.path.exists(p): os.remove(p)

    @staticmethod
    async def query_bridge(query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        uplink = AntigravityUplink()
        return await uplink.send_payload(query, context)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        asyncio.run(AntigravityUplink.query_bridge(sys.argv[1]))
