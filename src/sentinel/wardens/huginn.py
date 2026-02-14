"""
[Huginn: NEURAL TRACE ANALYSIS]
Lore: "One of the Ravens who flies over the world to bring news to Odin."
Purpose: Analyze .agent/traces for AI hallucinations, state deviance, or path leaks.
Now upgraded with Neural Auditing capabilities.
"""

import os
import re
from pathlib import Path
from typing import List, Dict, Any
from google import genai
from google.genai import types
from src.sentinel.wardens.base import BaseWarden

class HuginnWarden(BaseWarden):
    def __init__(self, root: Path):
        super().__init__(root)
        self.trace_dir = root / ".agent" / "traces"
        self.api_key = os.getenv("GOOGLE_API_KEY")
        self.client = genai.Client(api_key=self.api_key) if self.api_key else None

    def scan(self) -> List[Dict[str, Any]]:
        targets = []
        if not self.trace_dir.exists():
            return targets

        # 1. Classic Regex Scan (Fast)
        targets.extend(self._scan_regex())

        # 2. Neural Audit (Slow, but deep)
        # Only audit the most recent trace to save tokens/time
        # Or audit traces that look suspicious from regex? 
        # Requirement says: "Use a 'Junior' LLM (Gemini 2.0 Flash) to analyze .agent/traces"
        
        # Taking the most recent trace file
        traces = list(self.trace_dir.glob("*.md"))
        if not traces:
            return targets
            
        latest_trace = max(traces, key=os.path.getmtime)
        
        # Only run neural audit if regex found nothing? Or typically run it?
        # Let's run it on the latest trace always, but maybe limit frequency?
        # For now, simplistic implementation: Always audit latest.
        if self.client:
            targets.extend(self._scan_neural(latest_trace))

        return targets

    def _scan_regex(self) -> List[Dict[str, Any]]:
        targets = []
        patterns = {
            "HALLUCINATION_REPEATED_HEADER": (r"(#+ .*?\n)\1{2,}", "Repeated markdown headers detected"),
            "HALLUCINATION_REPEATED_TOKEN": (r"(\[.*?\])\s*\1{3,}", "Repeated bracketed tokens"),
            "DEVIANCE_TEMP_PATH": (r"/tmp/|/var/tmp/", "Suspicious temporary path found"),
            "DEVIANCE_USER_LEAK": (r"C:\\Users\\(?!Craig).*", "Potential user path leak detected")
        }

        for trace_file in self.trace_dir.rglob("*.md"):
            try:
                content = trace_file.read_text(encoding='utf-8')
                rel_path = str(trace_file.relative_to(self.root))

                for key, (pattern, message) in patterns.items():
                    match = re.search(pattern, content, re.MULTILINE)
                    if match:
                        targets.append({
                            "type": f"HUGINN_{key}",
                            "file": rel_path,
                            "action": f"Remediate Neural Deviance: {message}",
                            "severity": "MEDIUM",
                            "line": content.count("\n", 0, match.start()) + 1
                        })
            except Exception: pass
        return targets

    def _scan_neural(self, trace_file: Path) -> List[Dict[str, Any]]:
        targets = []
        try:
            content = trace_file.read_text(encoding='utf-8')
            # Truncate if too long for Flash context (though Flash has huge context, let's be safe/fast)
            if len(content) > 50000:
                content = content[-50000:]

            prompt = f"""
            Analyze the following agent session trace for subtle hallucinations, logical loops, or state deviance that regex might miss.
            Focus on:
            1. The agent getting stuck in a loop of repeating the same failed tool call.
            2. The agent inventing file paths that likely don't exist.
            3. The agent claiming to have fixed something but immediately seeing the same error.
            
            Return a JSON object with a list of "breaches". Each breach should have:
            - description: What went wrong.
            - confidence: 0.0 to 1.0 (Ignore anything below 0.8).
            
            TRACE CONTENT:
            {content}
            """

            response = self.client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1
                )
            )
            
            if response.text:
                import json
                analysis = json.loads(response.text)
                for breach in analysis.get("breaches", []):
                    if breach.get("confidence", 0) >= 0.8:
                        targets.append({
                            "type": "HUGINN_NEURAL_DETECT",
                            "file": str(trace_file.relative_to(self.root)),
                            "action": f"Neural Audit Alert: {breach['description']}",
                            "severity": "HIGH",
                            "line": 1 # Hard to pinpoint line number from LLM w/o complex logic
                        })

        except Exception:
            pass
        return targets
