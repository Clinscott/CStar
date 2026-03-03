"""
[SPOKE] Vector Shadow
Lore: "The echoes in the dark."
Purpose: Handle TF-IDF indexing and fast lexical search via MemoryDB.
"""

from typing import Any

class VectorShadow:
    def __init__(self, memory_db, stopwords: set[str], thesaurus: dict[str, set[str]]):
        self.memory_db = memory_db
        self.stopwords = stopwords
        self.thesaurus = thesaurus

    def search(self, query_norm: str) -> list[dict[str, Any]]:
        """Fast lexical search using MemoryDB's inverted index."""
        # MemoryDB search_intent handles both semantic and lexical mock fallback
        results = self.memory_db.search_intent("system", query_norm, n_results=5)
        return results

    def build_index(self) -> None:
        """Mock method for index building (managed by MemoryDB/Chroma)."""
        pass
