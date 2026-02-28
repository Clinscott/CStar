#!/usr/bin/env python3
"""
[O.D.I.N.] Gemini Search Provider
Lore: "The All-Father's Vision."
Purpose: Integrated web search via Gemini CLI's internal search capabilities.
"""

import json
import os
import sys
from pathlib import Path
from typing import Any

# Add project root to sys.path
project_root = Path(__file__).resolve().parents[2]
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from src.core.sovereign_hud import SovereignHUD

class GeminiSearch:
    """
    Search provider that utilizes the Gemini CLI's built-in google_web_search tool.
    Bypasses local API keys and quotas when GEMINI_CLI_ACTIVE is true.
    """

    def __init__(self) -> None:
        self.active = os.getenv("GEMINI_CLI_ACTIVE") == "true"

    def is_available(self) -> bool:
        """Determines if the Gemini Search provider is active."""
        return self.active

    def search(self, query: str) -> list[dict[str, str]]:
        """
        Executes a search via Gemini CLI directive.
        """
        if not self.active:
            SovereignHUD.persona_log("WARN", "GeminiSearch: CLI Integration not active. Use BraveSearch instead.")
            return []

        directive = {
            "type": "SEARCH_REQUEST",
            "query": query
        }

        # Output for Gemini CLI to intercept
        print(f"""
[GEMINI_SEARCH_DIRECTIVE]
{json.dumps(directive)}
[/GEMINI_SEARCH_DIRECTIVE]""")

        # In a real integration, the CLI would provide these results back.
        # For now, we return a sentinel that the caller can handle or wait for.
        SovereignHUD.persona_log("INFO", f"GeminiSearch: Request emitted to Master Mind for '{query}'.")
        
        # [ALFRED] If this were a blocking call in a standalone daemon, we would wait on a socket.
        # Since we are in the CLI flow, we assume the CLI provides results in the next turn 
        # or we provide a simulated pass-through.
        return []

def main() -> None:
    """CLI entry point for Gemini Search."""
    searcher = GeminiSearch()
    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])
        searcher.search(query)
    else:
        print("Usage: python -m src.tools.gemini_search <query>")

if __name__ == "__main__":
    main()
