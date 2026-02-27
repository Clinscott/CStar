#!/usr/bin/env python3
"""
[ALFRED] Brave Search Quota Manager & Tool
Implementation of the Bifröst primary search loop with 1,000/mo hard stop.
"""

import json
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import requests

from src.core.sovereign_hud import SovereignHUD


class BraveSearch:
    """
    Manages search operations via the Brave Search API.
    Includes monthly quota management and retry logic.
    """
    QUOTA_FILE: Path = Path(".agent/brave_quota.json")
    MAX_QUOTA: int = 1000

    def __init__(self) -> None:
        """Initializes the searcher with environment API key."""
        self.api_key: str | None = os.getenv("BRAVE_API_KEY")
        self._ensure_quota_ledger()

    def _ensure_quota_ledger(self) -> None:
        """Initializes or resets the quota ledger based on the current month."""
        current_month: str = datetime.now().strftime("%Y-%m")
        if not self.QUOTA_FILE.parent.exists():
            self.QUOTA_FILE.parent.mkdir(parents=True, exist_ok=True)

        if not self.QUOTA_FILE.exists():
            data = {"month": current_month, "count": 0}
            self._save_ledger(data)
        else:
            data = self._read_ledger()
            if data.get("month") != current_month:
                data = {"month": current_month, "count": 0}
                self._save_ledger(data)

    def _read_ledger(self) -> dict[str, Any]:
        """Reads the current quota state from disk."""
        try:
            with open(self.QUOTA_FILE, encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {"month": datetime.now().strftime("%Y-%m"), "count": 0}

    def _save_ledger(self, data: dict[str, Any]) -> None:
        """Persists the current quota state to disk."""
        with open(self.QUOTA_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def _increment_quota(self) -> None:
        """Increments the monthly search count."""
        data = self._read_ledger()
        data["count"] += 1
        self._save_ledger(data)

    def is_quota_available(self) -> bool:
        """Checks if the monthly search quota has been reached."""
        data = self._read_ledger()
        return data["count"] < self.MAX_QUOTA

    def search(self, query: str) -> list[dict[str, str]]:
        """
        Executes a Brave Search. Returns a list of result dictionaries.

        Args:
            query: The search query.

        Returns:
            A list of dictionaries, each containing:
                - title (str): The page title.
                - description (str): The snippet or description.
                - url (str): The direct URL.

        Enforces the 1,000 search/month limit and implements exponential backoff retries.
        """
        if not self.api_key:
            SovereignHUD.persona_log("ERROR", "BRAVE_API_KEY not found in environment.")
            return []

        if not self.is_quota_available():
            SovereignHUD.persona_log("ERROR", "Brave Search Quota Exhausted (1,000/mo hit).")
            return []

        endpoint: str = "https://api.search.brave.com/res/v1/web/search"
        headers: dict[str, str] = {
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": self.api_key
        }
        params: dict[str, str] = {"q": query}

        max_retries: int = 3
        for attempt in range(max_retries):
            try:
                response = requests.get(endpoint, headers=headers, params=params, timeout=10)
                response.raise_for_status()
                self._increment_quota()

                data = response.json()
                results: list[dict[str, str]] = []
                for result in data.get("web", {}).get("results", []):
                    results.append({
                        "title": result.get("title", "No Title"),
                        "description": result.get("description", "No Description"),
                        "url": result.get("url", "No URL")
                    })
                return results
            except requests.exceptions.RequestException as e:
                SovereignHUD.persona_log("WARN", f"Brave Search Request Failed (Attempt {attempt+1}/{max_retries}): {e!s}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                else:
                    SovereignHUD.persona_log("ERROR", f"Brave Search Exhausted: {e!s}")
                    return []
            except Exception as e:
                SovereignHUD.persona_log("ERROR", f"Brave Search Error: {e!s}")
                return []

        return []

    def search_knowledge(self, intent: str) -> list[dict[str, str]]:
        """
        Specialized search for Python skill acquisition.
        Wraps user intent in semantic hints to pull documentation and code.
        """
        knowledge_query: str = f"Python implementation example for {intent} with documentation"
        SovereignHUD.persona_log("ALFRED", f"Transmuting intent into knowledge query: {knowledge_query}")
        return self.search(knowledge_query)

def main() -> None:
    """CLI entry point for Brave Search."""
    import sys

    # [ALFRED] Ensure environment is loaded (e.g. .env.local)
    try:
        from src.sentinel._bootstrap import bootstrap
        bootstrap()
    except ImportError:
        pass

    searcher = BraveSearch()

    if len(sys.argv) > 1:
        query: str = " ".join(sys.argv[1:])
        SovereignHUD.persona_log("INFO", f"Executing Brave Search for: {query}")
        results = searcher.search(query)

        if results:
            SovereignHUD.box_top(f"SEARCH RESULTS: {query}")
            for i, res in enumerate(results):
                title = res.get('title', 'N/A')
                url = res.get('url', 'N/A')
                desc = res.get('description', 'N/A')

                if len(desc) > 80:
                    desc = desc[:77] + "..."

                print(f"\n{SovereignHUD.CYAN}[{i+1}] {SovereignHUD.BOLD}{title}{SovereignHUD.RESET}")
                print(f"    {SovereignHUD.DIM}{url}{SovereignHUD.RESET}")
                print(f"    {desc}")
            print(f"\n{SovereignHUD.DIM}Found {len(results)} results.{SovereignHUD.RESET}")
        else:
            SovereignHUD.persona_log("WARN", "No results returned.")
    else:
        SovereignHUD.persona_log("WARN", "Usage: python -m src.tools.brave_search <query>")

if __name__ == "__main__":
    main()
