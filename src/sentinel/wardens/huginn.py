"""
[Huginn: NEURAL TRACE ANALYSIS]
Lore: "One of the Ravens who flies over the world to bring news to Odin."
Purpose: Analyze .agent/traces for AI hallucinations, state deviance, or path leaks.
Now upgraded with Neural Auditing capabilities.
"""

import contextlib
import os
import re
from pathlib import Path
from typing import Any

from src.sentinel.wardens.base import BaseWarden
from src.cstar.core.uplink import AntigravityUplink


class HuginnWarden(BaseWarden):
    def __init__(self, root: Path) -> None:
        super().__init__(root)
        self.trace_dir = root / ".agent" / "traces"
        self.api_key = os.getenv("MUNINN_API_KEY") or os.getenv("GOOGLE_API_KEY")
        # [Ω] Decoupled: Using Uplink for neural audits
        self.uplink = AntigravityUplink(api_key=self.api_key)

    def scan(self) -> list[dict[str, Any]]:
        targets = []
        if not self.trace_dir.exists():
            return targets

        # 1. Classic Regex Scan (Fast)
        targets.extend(self._scan_regex())

        # 2. Neural Audit (Slow, but deep)
        traces = list(self.trace_dir.glob("*.md"))
        if not traces:
            return targets

        latest_trace = max(traces, key=os.path.getmtime)

        # [Ω] Trigger async audit via sync wrapper
        import asyncio
        targets.extend(asyncio.run(self._scan_neural_async(latest_trace)))

        return targets

    async def _scan_neural_async(self, trace_file: Path) -> list[dict[str, Any]]:
        targets = []
        with contextlib.suppress(Exception):
            content = trace_file.read_text(encoding='utf-8')
            if len(content) > 50000:
                content = content[-50000:]

            prompt = f"""
            Analyze the following agent session trace for subtle hallucinations, logical loops, or state deviance.
            Return a JSON object with a list of "breaches".
            TRACE CONTENT:
            {content}
            """

            response = await self.uplink.send_payload(prompt, {"persona": "ALFRED"})
            
            if response.get("status") == "pending":
                return [] # CLI will handle

            raw_text = response.get("data", {}).get("raw", "")
            if raw_text:
                import json
                # Handle potential markdown wrapper in response
                clean_json = raw_text.strip("`").replace("json\n", "", 1)
                analysis = json.loads(clean_json)
                for breach in analysis.get("breaches", []):
                    if breach.get("confidence", 0) >= 0.8:
                        targets.append({
                            "type": "HUGINN_NEURAL_DETECT",
                            "file": str(trace_file.relative_to(self.root)),
                            "action": f"Neural Audit Alert: {breach['description']}",
                            "severity": "HIGH",
                            "line": 1
                        })
        return targets
