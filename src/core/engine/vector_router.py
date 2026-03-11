"""
[SPOKE] Vector Router
Lore: "The Guardian of the Gates."
Purpose: Classify queries into specific domains (CORE, DEV, UI, etc.) to target semantic search.
"""

class VectorRouter:
    def __init__(self, memory_db):
        self.memory_db = memory_db

    def get_top_domain(self, query_norm: str, query_raw: str) -> str:
        """Determines the most likely domain for a query."""
        # Domain triggers
        domain_keywords = {
            "CORE": ["session", "dormancy", "sleep", "setup", "wrap", "ledger", "lets-go", "task", "plan", "workflow"],
            "DEV": ["test", "debug", "verify", "analyze", "scan", "refactor", "investigate", "integrity", "git"],
            "UI": ["matrix", "graph", "view", "hud", "visual", "aesthetics", "layout", "sci-fi", "glass", "neon", "glow"],
            "SYSTEM": ["process", "daemon", "bridge", "uplink", "cortex"]
        }

        for domain, keywords in domain_keywords.items():
            if any(k in query_norm for k in keywords):
                return domain
        
        return "GENERAL"
