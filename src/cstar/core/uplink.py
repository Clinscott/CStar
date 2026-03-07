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
        
        # [🔱] TIER 0: CI / Mock Safety
        if os.getenv("CI") == "true" and not os.getenv("GOOGLE_API_KEY"):
            return {"status": "success", "data": {"raw": "CI MOCK: Synaptic Intelligence Offline."}}

        # [🔱] TIER 1: Synaptic Link (MCP Sampling)
        try:
            system_prompt = context.get("system_prompt") if context else None
            # mimir.think is the recursive-safe bridge
            result = await mimir.think(query, system_prompt=system_prompt)
            if result:
                return {"status": "success", "data": {"raw": result}}
        except Exception as e:
            # Only log warning if not in test env
            if os.getenv("NODE_ENV") != "test":
                SovereignHUD.log("WARN", f"Synaptic Link failure: {e}. Attempting Direct Strike fallback...")

        # [🔱] TIER 2: Direct Strike (CLI Fallback)
        # This is the recursive-prone method, used only if Mimir is unavailable.
        return await self._direct_strike(query, context)

    async def _direct_strike(self, query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Robust fallback using direct HTTP to Google Generative Language API."""
        try:
            from dotenv import load_dotenv
            import pathlib
            root = pathlib.Path(__file__).parent.parent.parent.parent
            load_dotenv(root / ".env.local")
            load_dotenv(root / ".env")
        except ImportError:
            pass
            
        api_key = self.api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            return {"status": "error", "message": "Direct Strike failed: No API key found in environment."}
            
        import urllib.request
        import urllib.error
        
        model = context.get("model", "gemini-3-flash-preview") if context else "gemini-3-flash-preview"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        
        system_instruction = None
        if context and context.get("system_prompt"):
            system_instruction = {
                "role": "user",
                "parts": [{"text": context["system_prompt"]}]
            }
            
        payload = {
            "contents": [{"parts": [{"text": query}]}]
        }
        
        if system_instruction:
            payload["system_instruction"] = system_instruction
            
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        
        try:
            # We must run blocking I/O in a thread to keep asyncio healthy
            loop = asyncio.get_running_loop()
            import concurrent.futures
            
            def make_request():
                with urllib.request.urlopen(req, timeout=120) as response:
                    return response.read()
                    
            with concurrent.futures.ThreadPoolExecutor() as pool:
                response_body = await loop.run_in_executor(pool, make_request)
                
            res_json = json.loads(response_body.decode('utf-8'))
            
            # Extract the text from the Gemini API response structure
            try:
                candidate = res_json['candidates'][0]
                text = ""
                for part in candidate.get('content', {}).get('parts', []):
                    if 'text' in part:
                        text += part['text']
                return {"status": "success", "data": {"raw": text}}
            except (KeyError, IndexError):
                return {"status": "error", "message": "Direct Strike failed: Unrecognized API response structure."}
                
        except urllib.error.URLError as e:
            err_msg = str(e)
            if hasattr(e, 'read'):
                try:
                    err_msg = e.read().decode('utf-8')
                except Exception:
                    pass
            SovereignHUD.log("ERROR", f"Direct Strike HTTP failure: {err_msg}")
            return {"status": "error", "message": f"Direct Strike HTTP failure: {err_msg}"}
        except Exception as e:
            SovereignHUD.log("ERROR", f"Direct Strike failure: {str(e)}")
            return {"status": "error", "message": f"Direct Strike failure: {str(e)}"}

    @staticmethod
    async def query_bridge(query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        uplink = AntigravityUplink()
        return await uplink.send_payload(query, context)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        asyncio.run(AntigravityUplink.query_bridge(sys.argv[1]))
