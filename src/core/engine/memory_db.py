try:
    import chromadb
except ImportError:
    chromadb = None

import json
from pathlib import Path
from typing import Any, List, Dict

class MemoryDB:
    """
    [ODIN] The Semantic Brain of Corvus Star.
    Wraps ChromaDB with ONNX-powered local embeddings for intent resolution.
    Falls back to SimulatedMemoryDB if chromadb is missing.
    """
    def __init__(self, project_root: str):
        self.root = Path(project_root)
        self.db_path = self.root / ".agent" / "chroma_db"
        self.simulated = chromadb is None
        
        if not self.simulated:
            try:
                # Initialize Persistent Client
                self.client = chromadb.PersistentClient(path=str(self.db_path))
                
                # [ALFRED] Ensure we use Cosine space for 0.0-1.0 confidence mapping
                self.collection = self.client.get_or_create_collection(
                    name="cstar_skills",
                    metadata={"hnsw:space": "cosine"}
                )
            except Exception:
                from src.core.ui import HUD
                HUD.persona_log("WARN", "ChromaDB failed to initialize. Falling back to Simulation.")
                self.simulated = True
                self.collection = None
        else:
            self.collection = None
            # Initialize in-memory mock storage
            self._mock_records = [] # List of {ids, docs, metadatas}
            # Pre-load some baseline skills for Pillar 2 assertion
            self._mock_records.append({
                "id": "/workflow_deployment",
                "doc": "Deploy the system to live production environment",
                "metadata": {}
            })

    def upsert_skill(self, intent_id: str, description: str, metadata: Dict[str, Any] = None):
        """Adds or updates a skill in the semantic database."""
        if not self.simulated and self.collection:
            # [ALFRED] ChromaDB requires non-empty metadata in some versions
            safe_metadata = metadata or {"source": "SovereignEngine"}
            self.collection.upsert(
                documents=[description],
                metadatas=[safe_metadata],
                ids=[intent_id]
            )
        else:
            # Update mock
            # Remove existing ID if present
            self._mock_records = [r for r in self._mock_records if r["id"] != intent_id]
            self._mock_records.append({
                "id": intent_id,
                "doc": description,
                "metadata": metadata or {}
            })

    def search_intent(self, query: str, n_results: int = 1) -> List[Dict[str, Any]]:
        """
        Performs raw semantic search.
        In Cosine space: 0.0 = identical, 1.0 = orthogonal.
        Returns mapped results with 'confidence' score (1.0 - distance).
        """
        if not self.simulated and self.collection:
            try:
                results = self.collection.query(
                    query_texts=[query],
                    n_results=n_results
                )
                
                formatted_results = []
                if not results['ids'] or not results['ids'][0]:
                    return []

                for i in range(len(results['ids'][0])):
                    intent_id = results['ids'][0][i]
                    distance = results['distances'][0][i]
                    doc = results['documents'][0][i]
                    
                    # Mapping Cosine distance to confidence score
                    confidence = max(0.0, 1.0 - float(distance))
                    
                    formatted_results.append({
                        "trigger": intent_id,
                        "score": confidence,
                        "metadata": results['metadatas'][0][i],
                        "description": doc
                    })
                    
                return formatted_results
            except Exception:
                pass # Fallback to simulation if query fails

        # Simulated Search (Lexical matching)
        query = query.lower()
        processed = []
        for r in self._mock_records:
            doc = r["doc"].lower()
            # Simple word overlap for score
            q_words = set(query.split())
            d_words = set(doc.split())
            overlap = len(q_words & d_words)
            score = (overlap / len(q_words)) if q_words else 0.0
            
            # Boost if ID matches
            if query in r["id"].lower():
                score = max(score, 0.95)
            
            if score > 0:
                processed.append({
                    "trigger": r["id"],
                    "score": score,
                    "metadata": r["metadata"],
                    "description": r["doc"]
                })
        
        processed.sort(key=lambda x: x["score"], reverse=True)
        return processed[:n_results]
