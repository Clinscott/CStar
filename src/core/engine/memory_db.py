try:
    import chromadb
except ImportError:
    chromadb = None

import re
from pathlib import Path
from typing import Any

from src.core.engine.hall_schema import HallOfRecords


class MemoryDB:
    """
    [O.D.I.N.] The Semantic Brain of Corvus Star.
    Wraps ChromaDB with strict Multi-Tenant partitioning.
    """
    def __init__(self, project_root: str):
        self.root = Path(project_root)
        self.db_path = self.root / ".agents" / "chroma_db"
        self.hall = HallOfRecords(self.root)
        self.simulated = chromadb is None
        self._mock_records = [] # [ALFRED] Always initialize
        self._sim_cache: dict[str, list[dict]] = {} # [Ω] Partitioned cache

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
            # Pre-load baseline
            self._mock_records.append({
                "id": "system::/workflow_deployment",
                "doc": "Deploy the system to live production environment",
                "metadata": {"app_id": "system"}
            })

    def batch_upsert_skills(self, app_id: str, skills: list[dict[str, Any]]) -> None:
        """[Ω] Optimized batch loading for massive skill deployments."""
        if not skills: return
        
        unique_skills = {}
        for s in skills:
            composite_id = f"{app_id}::{s['trigger']}"
            unique_skills[composite_id] = s # Last one wins

        ids = list(unique_skills.keys())
        docs = [s['description'] for s in unique_skills.values()]
        metadatas = []
        
        for composite_id, s in unique_skills.items():
            meta = s.get('metadata', {})
            meta['app_id'] = app_id
            metadatas.append(meta)

        if not self.simulated and self.collection:
            self.collection.upsert(
                documents=docs,
                metadatas=metadatas,
                ids=ids
            )
        else:
            # Update mock
            for i in range(len(ids)):
                self._mock_records = [r for r in self._mock_records if r["id"] != ids[i]]
                self._mock_records.append({
                    "id": ids[i],
                    "doc": docs[i],
                    "metadata": metadatas[i]
                })

    def upsert_skill(self, app_id: str, intent_id: str, description: str, metadata: dict[str, Any] | None = None) -> None:
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

    def search_intent(self, app_id: str, query: str, n_results: int = 1, domain: str | None = None) -> list[dict[str, Any]]:
        """
        [PHASE 2] Zero-Trust Isolation.
        Filters by app_id in metadata and optionally by domain.
        """
        # [Ω] SIMULATION CACHE: Avoid O(N) scans for identical queries
        cache_key = f"{app_id}::{domain or 'ALL'}::{query.lower()}"
        if cache_key in self._sim_cache:
            return self._sim_cache[cache_key]

        if not self.simulated and self.collection:
            try:
                # Construct filter
                query_filter = {"app_id": app_id}
                if domain:
                    query_filter["domain"] = domain

                results = self.collection.query(
                    query_texts=[query],
                    n_results=n_results,
                    where=query_filter # Strict partitioning
                )

                if not results['ids'] or not results['ids'][0]:
                    # Fallback if domain was too strict
                    if domain and domain != "GENERAL":
                        return self.search_intent(app_id, query, n_results, domain=None)
                    return []

                formatted_results = []
                for i in range(len(results['ids'][0])):
                    composite_id = results['ids'][0][i]
                    intent_id = composite_id.replace(f"{app_id}::", "", 1)

                    distance = results['distances'][0][i]
                    confidence = max(0.0, 1.0 - float(distance))

                    metadata = results['metadatas'][0][i]
                    formatted_results.append({
                        "trigger": intent_id,
                        "score": confidence,
                        "metadata": metadata,
                        "description": results['documents'][0][i],
                        "domain": metadata.get("domain", "GENERAL")
                    })
                return formatted_results
            except Exception:
                pass

        # Simulated Sandbox
        query = query.lower()
        processed = []
        
        # [Ω] STRICT FILTERING: Only consider records for this app_id
        # In simulation, we must be absolutely strict to avoid GLOBAL pollution
        sandbox = [r for r in self._mock_records if r["metadata"].get("app_id") == app_id]
        
        # If we are looking for a specific domain, filter by it
        domain_sandbox = sandbox
        if domain:
            domain_sandbox = [r for r in sandbox if r["metadata"].get("domain") == domain]

        for r in domain_sandbox:
            intent_id = r["id"].replace(f"{app_id}::", "", 1)
            doc = r["doc"].lower()
            q_words = set(query.split())
            d_words = set(doc.split())
            
            # [Ω] EXACT NAME MATCH: Absolute priority
            trigger_name = intent_id.lower().lstrip("/")
            if query == trigger_name or query == intent_id.lower():
                score = 1.0
            elif query in trigger_name or trigger_name in query:
                score = 0.95
            else:
                # [Ω] FUZZY MATCH: Word overlap
                overlap_words = q_words & d_words
                trigger_tokens = set(re.findall(r'\w+', trigger_name))
                trigger_overlap = q_words & trigger_tokens
                
                if trigger_overlap:
                    score = 0.8 # Very high if name contains query word
                elif overlap_words:
                    # Semantic overlap
                    weighted_overlap = sum(len(w) for w in overlap_words)
                    weighted_total = sum(len(w) for w in q_words)
                    score = (weighted_overlap / weighted_total) if weighted_total else 0.0
                    score = max(score, 0.4) # Floor for any match
                else:
                    score = 0.0

            if score > 0:
                metadata = r["metadata"]
                processed.append({
                    "trigger": intent_id,
                    "score": score,
                    "metadata": metadata,
                    "description": r["doc"],
                    "domain": metadata.get("domain", "GENERAL")
                })

        processed.sort(key=lambda x: x["score"], reverse=True)
        final_results = processed[:n_results]
        
        # [Ω] CONFIDENCE FALLBACK: If top result is low confidence, try broader search
        if domain and (not final_results or final_results[0]["score"] < 0.5):
            broad_results = self.search_intent(app_id, query, n_results, domain=None)
            # Merge and sort again
            final_results = sorted(final_results + broad_results, key=lambda x: x["score"], reverse=True)[:n_results]

        self._sim_cache[cache_key] = final_results
        return final_results

    def get_total_skills(self) -> int:
        """Returns the total number of skills across all tenants."""
        if not self.simulated and self.collection:
            return self.collection.count()
        return len(self._mock_records)

    def clear_active_ram(self) -> None:
        """Purges volatile caches."""
        self._sim_cache.clear()

    def get_hall_of_records(self) -> HallOfRecords:
        """Returns the canonical Hall authority bound to this workspace."""
        return self.hall

    def get_skill_registry_root(self) -> Path:
        """Returns the authoritative woven-skill registry root for this workspace."""
        return self.root / ".agents" / "skills"

    def get_skill_registry_manifest(self) -> Path:
        """Returns the generated V2 registry manifest path."""
        return self.root / ".agents" / "skill_registry.json"
