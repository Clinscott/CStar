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

    def __init__(self) -> None:
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

    def search(self, query: str) -> list[dict[str, str]]:
        """
        Executes a Brave Search. Returns a list of result dictionaries.
        
        Args:
            query (str): The search query.
            
        Returns:
            list[dict]: A list of dictionaries, each containing:
                - title (str): The page title.
                - description (str): The snippet or description.
                - url (str): The direct URL.
        
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
    import sys
    
    # [ALFRED] Ensure environment is loaded (e.g. .env.local)
    try:
        from src.sentinel._bootstrap import bootstrap
        bootstrap()
    except ImportError:
        pass # Fallback or already loaded if integrated

    # Simple CLI dispatch
    # Usage: python src/tools/brave_search.py "search query"
    
    searcher = BraveSearch()
    
    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:]) # Handle multi-word queries without quotes if needed, or just take the rest
        
        HUD.persona_log("INFO", f"Executing Brave Search for: {query}")
        
        results = searcher.search(query)
        
        if results:
            HUD.box_top(f"SEARCH RESULTS: {query}")
            
            for i, res in enumerate(results):
                title = res.get('title', 'N/A')
                url = res.get('url', 'N/A')
                desc = res.get('description', 'N/A')
                
                # Truncate description if too long for clean display
                if len(desc) > 80:
                    desc = desc[:77] + "..."
                    
                print(f"\n{HUD.CYAN}[{i+1}] {HUD.BOLD}{title}{HUD.RESET}")
                print(f"    {HUD.DIM}{url}{HUD.RESET}")
                print(f"    {desc}")
                
            print(f"\n{HUD.DIM}Found {len(results)} results.{HUD.RESET}")
        else:
            HUD.persona_log("WARN", "No results returned.")
            
    else:
        HUD.persona_log("WARN", "Usage: python -m src.tools.brave_search <query>")