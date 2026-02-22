import chromadb
from pathlib import Path
from typing import Any, List, Dict

class MemoryDB:
    """
    [ODIN] The Semantic Brain of Corvus Star.
    Wraps ChromaDB with ONNX-powered local embeddings for intent resolution.
    """
    def __init__(self, project_root: str):
        self.root = Path(project_root)
        self.db_path = self.root / ".agent" / "chroma_db"
        
        # Initialize Persistent Client
        self.client = chromadb.PersistentClient(path=str(self.db_path))
        
        # [ALFRED] Ensure we use Cosine space for 0.0-1.0 confidence mapping
        self.collection = self.client.get_or_create_collection(
            name="cstar_skills",
            metadata={"hnsw:space": "cosine"}
        )

    def upsert_skill(self, intent_id: str, description: str, metadata: Dict[str, Any] = None):
        """Adds or updates a skill in the semantic database."""
        # [ALFRED] Description is now expected to be enriched by the caller (bootstrap)
        self.collection.upsert(
            documents=[description],
            metadatas=[metadata or {}],
            ids=[intent_id]
        )

    def search_intent(self, query: str, n_results: int = 1) -> List[Dict[str, Any]]:
        """
        Performs raw semantic search.
        In Cosine space: 0.0 = identical, 1.0 = orthogonal.
        Returns mapped results with 'confidence' score (1.0 - distance).
        """
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
