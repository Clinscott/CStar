import re
from pathlib import Path
from typing import Any, NoReturn


LEGACY_MEMORY_AUTHORITY_ERROR = (
    "legacy_python_memory_authority_retired_use_cstar_kernel"
)


class MemoryDB:
    """Detached, in-memory compatibility index with no durable authority."""

    def __init__(self, project_root: str) -> None:
        self.root = Path(project_root)
        self.simulated = True
        self.detached = True
        self.collection = None
        self._mock_records: list[dict[str, Any]] = []
        self._sim_cache: dict[str, list[dict[str, Any]]] = {}

    def batch_upsert_skills(self, app_id: str, skills: list[dict[str, Any]]) -> None:
        """[Ω] Optimized batch loading for massive skill deployments."""
        if not skills:
            return

        unique_skills: dict[str, dict[str, Any]] = {}
        for s in skills:
            composite_id = f"{app_id}::{s['trigger']}"
            unique_skills[composite_id] = s  # Last one wins

        ids = list(unique_skills.keys())
        docs = [skill["description"] for skill in unique_skills.values()]
        metadatas: list[dict[str, Any]] = []

        for skill in unique_skills.values():
            meta = dict(skill.get("metadata", {}))
            meta["app_id"] = app_id
            metadatas.append(meta)

        for i in range(len(ids)):
            self._mock_records = [r for r in self._mock_records if r["id"] != ids[i]]
            self._mock_records.append(
                {
                    "id": ids[i],
                    "doc": docs[i],
                    "metadata": metadatas[i],
                }
            )
        self._sim_cache.clear()

    def upsert_skill(self, app_id: str, intent_id: str, description: str, metadata: dict[str, Any] | None = None) -> None:
        """
        [PHASE 2] Composite ID Namespacing.
        Ensures no cross-tenant collisions (app_id::intent_id).
        """
        composite_id = f"{app_id}::{intent_id}"
        safe_metadata = dict(metadata or {})
        safe_metadata["app_id"] = app_id

        self._mock_records = [r for r in self._mock_records if r["id"] != composite_id]
        self._mock_records.append(
            {
                "id": composite_id,
                "doc": description,
                "metadata": safe_metadata,
            }
        )
        self._sim_cache.clear()

    def search_intent(self, app_id: str, query: str, n_results: int = 1, domain: str | None = None) -> list[dict[str, Any]]:
        """
        [PHASE 2] Zero-Trust Isolation.
        Filters by app_id in metadata and optionally by domain.
        """
        # [Ω] SIMULATION CACHE: Avoid O(N) scans for identical queries
        cache_key = f"{app_id}::{domain or 'ALL'}::{query.lower()}"
        if cache_key in self._sim_cache:
            return self._sim_cache[cache_key]

        # Detached lexical compatibility search. No Chroma or filesystem fallback.
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
                trigger_tokens = set(re.findall(r"\w+", trigger_name))
                trigger_overlap = q_words & trigger_tokens

                if trigger_overlap:
                    score = 0.8  # High deterministic weight for trigger overlap.
                elif overlap_words:
                    # Semantic overlap
                    weighted_overlap = sum(len(w) for w in overlap_words)
                    weighted_total = sum(len(w) for w in q_words)
                    score = (weighted_overlap / weighted_total) if weighted_total else 0.0
                    score = max(score, 0.4)  # Deterministic floor for a word match.
                else:
                    score = 0.0

            if score > 0:
                metadata = r["metadata"]
                processed.append(
                    {
                        "trigger": intent_id,
                        "score": score,
                        "metadata": metadata,
                        "description": r["doc"],
                        "domain": metadata.get("domain", "GENERAL"),
                    }
                )

        processed.sort(key=lambda x: x["score"], reverse=True)
        final_results = processed[:n_results]

        # If a domain filter produces no useful lexical score, retry detached search.
        if domain and (not final_results or final_results[0]["score"] < 0.5):
            broad_results = self.search_intent(app_id, query, n_results, domain=None)
            # Merge and sort again
            final_results = sorted(final_results + broad_results, key=lambda x: x["score"], reverse=True)[:n_results]

        self._sim_cache[cache_key] = final_results
        return final_results

    def get_total_skills(self) -> int:
        """Return the number of entries in this process-local detached index."""
        return len(self._mock_records)

    def clear_active_ram(self) -> None:
        """Purges volatile caches."""
        self._sim_cache.clear()

    def get_hall_of_records(self) -> NoReturn:
        """Reject the former direct Hall authority escape hatch."""
        raise RuntimeError(LEGACY_MEMORY_AUTHORITY_ERROR)

    def get_skill_registry_root(self) -> Path:
        """Return a detached path value without reading the skill registry."""
        return self.root / ".agents" / "skills"

    def get_skill_registry_manifest(self) -> Path:
        """Return a detached manifest path value without reading it."""
        return self.root / ".agents" / "skill_registry.json"
