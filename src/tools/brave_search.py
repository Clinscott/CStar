#!/ env python3
"""
[ALFRED] Brave Search Quota Manager & Tool
Implementation of the Bifröst primary search loop with 1,000/mo hard stop.
"""

import os
import json
import requests
from datetime import datetime
from pathlib import Path
from src.core.ui import HUD

class BraveSearch:
    QUOTA_FILE = Path(".agent/brave_quota.json")
    MAX_QUOTA = 1000

    def __init__(self):
        self.api_key = os.getenv("BRAVE_API_KEY")
        self._ensure_quota_ledger()

    def _ensure_quota_ledger(self):
        """Initializes or resets the quota ledger based on the current month."""
        current_month = datetime.now().strftime("%Y-%m")
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

    def _read_ledger(self) -> dict:
        try:
            with open(self.QUOTA_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {"month": datetime.now().strftime("%Y-%m"), "count": 0}

    def _save_ledger(self, data: dict):
        with open(self.QUOTA_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def _increment_quota(self):
        data = self._read_ledger()
        data["count"] += 1
        self._save_ledger(data)

    def is_quota_available(self) -> bool:
        data = self._read_ledger()
        return data["count"] < self.MAX_QUOTA

    def search(self, query: str) -> list[dict]:
        """
        Executes a Brave Search. Returns snippets.
        Enforces the 1,000 search/month limit.
        """
        if not self.api_key:
            HUD.persona_log("ERROR", "BRAVE_API_KEY not found in environment.")
            return []

        if not self.is_quota_available():
            HUD.persona_log("ERROR", "Brave Search Quota Exhausted (1,000/mo hit).")
            return []

        endpoint = "https://api.search.brave.com/res/v1/web/search"
        headers = {
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": self.api_key
        }
        params = {"q": query}

        try:
            response = requests.get(endpoint, headers=headers, params=params, timeout=10)
            response.raise_for_status()
            self._increment_quota()
            
            data = response.json()
            results = []
            for result in data.get("web", {}).get("results", []):
                results.append({
                    "title": result.get("title"),
                    "description": result.get("description"),
                    "url": result.get("url")
                })
            return results
        except Exception as e:
            HUD.persona_log("ERROR", f"Brave Search Request Failed: {str(e)}")
            return []

if __name__ == "__main__":
    searcher = BraveSearch()
    if searcher.is_quota_available():
        test_results = searcher.search("Corvus Star AI Framework")
        print(json.dumps(test_results, indent=2))
    else:
        print("Quota Exhausted")
