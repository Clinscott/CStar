#!/usr/bin/env python3
"""
[SKILL] KnowledgeHunter
Active Web Research via Brave Search + Gemini Synthesis.
"""

import os
import re
import sys
from pathlib import Path

# [ALFRED] Ensure environment is loaded
try:
    project_root = Path(__file__).resolve().parents[4]
    sys.path.append(str(project_root))
    from src.core.bootstrap import SovereignBootstrap
    SovereignBootstrap.execute()
except (ImportError, ValueError, IndexError):
    pass # Fallback

from src.core.sovereign_hud import SovereignHUD
from src.tools.brave_search import BraveSearch
from src.cstar.core.uplink import AntigravityUplink


class KnowledgeHunter:
    def __init__(self):
        self.uplink = AntigravityUplink()
        self.searcher = BraveSearch()
        self.root = Path(__file__).parent.parent.parent.parent.parent.resolve() # CorvusStar root

    async def hunt(self, topic: str) -> None:
        SovereignHUD.persona_log("INFO", f"Hunting for knowledge on: {topic}...")

        # Step 1: Brave Search
        SovereignHUD.persona_log("INFO", "Deploying Brave Search spiders...")
        results = self.searcher.search(topic)

        if not results:
            SovereignHUD.persona_log("WARN", "The spiders returned empty-handed.")
            return

        # Step 2: Format Snippets
        snippets = ""
        for i, res in enumerate(results):
            snippets += f"[{i+1}] {res.get('title')}\n{res.get('description')}\nURL: {res.get('url')}\n\n"

        SovereignHUD.persona_log("INFO", f"Captured {len(results)} snippets. Synthesizing...")

        # Step 3: Gemini Synthesis (via Synaptic Uplink)
        prompt = f"""You are Odin's Knowledge Hunter.
        Synthesize the following web search results into a comprehensive, professional Markdown report.

        Topic: {topic}

        Search Results:
        {snippets}

        Format:
        - Title
        - Executive Summary
        - Key Findings (Bulleted)
        - Detailed Analysis
        - Sources (Link to URLs)
        """

        try:
            response = await self.uplink.send_payload(prompt, {"persona": "ODIN"})
            
            if response.get("status") == "success":
                report_content = response.get("data", {}).get("raw", "The Oracle provided no content.")

                # Step 4: Save Report
                slug = re.sub(r'[^a-z0-9]+', '_', topic.lower()).strip('_')
                filename = f"RESEARCH_{slug}.md"
                filepath = self.root / filename

                filepath.write_text(report_content, encoding='utf-8')

                SovereignHUD.persona_log("SUCCESS", f"Knowledge synthesized: {filename}")
            else:
                SovereignHUD.persona_log("ERROR", f"Synthesis failed: {response.get('message')}")

        except Exception as e:
            SovereignHUD.persona_log("ERROR", f"Synthesis failed: {e}")

if __name__ == "__main__":
    import asyncio
    if len(sys.argv) < 2:
        print("Usage: python hunter.py <topic>")
        sys.exit(1)

    topic = " ".join(sys.argv[1:])
    hunter = KnowledgeHunter()
    asyncio.run(hunter.hunt(topic))
