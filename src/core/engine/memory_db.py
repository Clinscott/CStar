try:
    import chromadb
except ImportError:
    chromadb = None

from pathlib import Path
from typing import Any


class MemoryDB:
    """
    [ODIN] The Semantic Brain of Corvus Star.
    Wraps ChromaDB with strict Multi-Tenant partitioning.
    """
    def __init__(self, project_root: str):
        self.root = Path(project_root)
        self.db_path = self.root / ".agent" / "chroma_db"
        self.simulated = chromadb is None

        if not self.simulated:
            try:
                self.client = chromadb.PersistentClient(path=str(self.db_path))
                self.collection = self.client.get_or_create_collection(
                    name="cstar_skills",
                    metadata={"hnsw:space": "cosine"}
                )
            except Exception:
                from src.core.sovereign_hud import SovereignHUD
                SovereignHUD.persona_log("WARN", "ChromaDB failed. Falling back to Simulation.")
                self.simulated = True
                self.collection = None
        else:
            self.collection = None
            self._mock_records = []
            # Pre-load baseline
            self._mock_records.append({
                "id": "system::/workflow_deployment",
                "doc": "Deploy the system to live production environment",
                "metadata": {"app_id": "system"}
            })

    def upsert_skill(self, app_id: str, intent_id: str, description: str, metadata: dict[str, Any] = None):
        """
        [PHASE 2] Composite ID Namespacing.
        Ensures no cross-tenant collisions (app_id::intent_id).
        """
        composite_id = f"{app_id}::{intent_id}"
        safe_metadata = metadata or {}
        safe_metadata["app_id"] = app_id

        if not self.simulated and self.collection:
            self.collection.upsert(
                documents=[description],
                metadatas=[safe_metadata],
                ids=[composite_id]
            )
        else:
            # Update mock
            self._mock_records = [r for r in self._mock_records if r["id"] != composite_id]
            self._mock_records.append({
                "id": composite_id,
                "doc": description,
                "metadata": safe_metadata
            })

    def search_intent(self, app_id: str, query: str, n_results: int = 1) -> list[dict[str, Any]]:
        """
        [PHASE 2] Zero-Trust Isolation.
        Filters by app_id in metadata and strips prefix on exit.
        """
        if not self.simulated and self.collection:
            try:
                results = self.collection.query(
                    query_texts=[query],
                    n_results=n_results,
                    where={"app_id": app_id} # Strict partitioning
                )

                if not results['ids'] or not results['ids'][0]:
                    return []

                formatted_results = []
                for i in range(len(results['ids'][0])):
                    composite_id = results['ids'][0][i]
                    intent_id = composite_id.replace(f"{app_id}::", "", 1)

                    distance = results['distances'][0][i]
                    confidence = max(0.0, 1.0 - float(distance))

                    formatted_results.append({
                        "trigger": intent_id,
                        "score": confidence,
                        "metadata": results['metadatas'][0][i],
                        "description": results['documents'][0][i]
                    })
                return formatted_results
            except Exception:
                pass

        # Simulated Sandbox
        query = query.lower()
        processed = []
        # Filter mock records by app_id FIRST
        sandbox = [r for r in self._mock_records if r["metadata"].get("app_id") == app_id]

        for r in sandbox:
            intent_id = r["id"].replace(f"{app_id}::", "", 1)
            doc = r["doc"].lower()
            q_words = set(query.split())
            d_words = set(doc.split())
            overlap = len(q_words & d_words)
            score = (overlap / len(q_words)) if q_words else 0.0

            if query in intent_id.lower():
                score = max(score, 0.95)

            if score > 0:
                processed.append({
                    "trigger": intent_id,
                    "score": score,
                    "metadata": r["metadata"],
                    "description": r["doc"]
                })

        processed.sort(key=lambda x: x["score"], reverse=True)
        return processed[:n_results]
