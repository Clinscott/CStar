"""
[Ω] Antigravity Uplink (v8.0 - Keyless).
Lore: "A Raven's mind is linked to the Well by the threads of the Bifrost."
Purpose: Universal Synaptic Bridge. Exclusively delegates thinking to MCP Sampling (mimir).
Mandate: No API Keys. No direct HTTP strikes.
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
    """[🔱] Cleans ANSI codes and formatting from CLI output for stable parsing."""
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    cleaned = ansi_escape.sub('', text).strip()

    object_start = cleaned.find("{")
    object_end = cleaned.rfind("}")
    if object_start != -1 and object_end != -1 and object_end > object_start:
        return cleaned[object_start:object_end + 1].strip()

    array_start = cleaned.find("[")
    array_end = cleaned.rfind("]")
    if array_start != -1 and array_end != -1 and array_end > array_start:
        return cleaned[array_start:array_end + 1].strip()

    return cleaned

class AntigravityUplink:
    """
    [Ω] The Synaptic Uplink.
    Exclusively uses high-fidelity MCP Sampling via Mimir.
    No fallbacks to direct strikes to ensure 'keyless' compliance.
    """

    def __init__(self, *args, **kwargs):
        """[🔱] Backward compatibility."""
        pass

    async def send_payload(self, query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Sends a payload to the Host Oracle."""
        
        try:
            system_prompt = context.get("system_prompt") if context else None
            response = await mimir.request(
                {
                    "prompt": query,
                    "system_prompt": system_prompt,
                    "caller": {
                        "source": "python:antigravity_uplink",
                        "persona": context.get("persona") if context else None,
                        "workflow": context.get("workflow") if context else None,
                    },
                    "metadata": context or {},
                }
            )

            trace = {
                "correlation_id": response.trace.correlation_id,
                "transport_mode": response.trace.transport_mode,
                "cached": response.trace.cached,
            }

            if response.status == "success" and response.raw_text:
                return {"status": "success", "data": {"raw": response.raw_text}, "trace": trace}

            return {
                "status": "error",
                "message": response.error or "The One Mind returned no intelligence.",
                "trace": trace,
            }
                
        except Exception as e:
            SovereignHUD.log("FAIL", f"Synaptic Uplink failure: {e}")
            return {"status": "error", "message": f"Uplink Failure: {str(e)}"}

    @staticmethod
    async def query_bridge(query: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        uplink = AntigravityUplink()
        return await uplink.send_payload(query, context)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        target = sys.argv[1]
        # [Ω] SAFE PASSAGE: If the target is a file, read it (circumvent WinError 206)
        if os.path.exists(target) and os.path.isfile(target):
            try:
                with open(target, 'r', encoding='utf-8') as f:
                    query = f.read()
            except Exception:
                query = target
        else:
            query = target
            
        asyncio.run(AntigravityUplink.query_bridge(query))
