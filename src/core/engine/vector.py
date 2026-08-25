"""
[ENGINE] Semantic Vector Router (Facade)
Lore: "The navigation charts of the Bifröst."
Purpose: Unified semantic router delegating to specialized spokes for intent resolution.
"""

# Intent: Central semantic routing hub for intent resolution, managing cross-domain search and hybrid scoring.

from collections import OrderedDict
from pathlib import Path
from typing import Any

from src.core.engine.instruction_loader import InstructionLoader
from src.core.engine.memory_db import MemoryDB
from src.core.sovereign_hud import SovereignHUD
from src.core.engine.vector_config import VectorConfig
from src.core.engine.vector_calculus import VectorCalculus
from src.core.engine.vector_router import VectorRouter
from src.core.engine.vector_shadow import VectorShadow
from src.core.engine.vector_ingest import VectorIngest


LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR = (
    "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel"
)


class SovereignVector:
    """
    [O.D.I.N.] Sovereign Semantic Facade.
    Delegates logic to specialized spokes while maintaining a unified interface.
    """
    SEARCH_CACHE_MAXSIZE = 512

    def __init__(
        self,
        thesaurus_path: str | Path | None = None,
        corrections_path: str | Path | None = None,
        stopwords_path: str | Path | None = None
    ) -> None:
        self.project_root: Path = Path(__file__).resolve().parents[3]
        self.memory_db = MemoryDB(str(self.project_root))
        self.instruction_loader = InstructionLoader(str(self.project_root))
        self._search_cache: OrderedDict[str, list[dict[str, Any]]] = OrderedDict()

        # Initialize Spokes
        self.config_spoke = VectorConfig(self.project_root)
        self.ingest_spoke = VectorIngest(self.memory_db)
        self.router_spoke = VectorRouter(self.memory_db)

        # Load Assets
        t_path = Path(thesaurus_path) if thesaurus_path else self.project_root / "src" / "data" / "thesaurus.qmd"
        s_path = Path(stopwords_path) if stopwords_path else self.project_root / "src" / "data" / "stopwords.json"
        c_path = Path(corrections_path) if corrections_path else self.project_root / ".agents" / "corrections.json"

        self.stopwords = self.config_spoke.load_stopwords(s_path)
        self.thesaurus = self.config_spoke.load_thesaurus(t_path)
        self.corrections = self.config_spoke.load_json(c_path) or {"phrase_mappings": {}}

        # Initialize Calculus and Shadow
        self.calculus_spoke = VectorCalculus(self.stopwords, self.thesaurus)
        self.shadow_spoke = VectorShadow(self.memory_db, self.stopwords, self.thesaurus)

        # Normalize phrase mappings
        if "phrase_mappings" in self.corrections:
            self.corrections["phrase_mappings"] = {
                self.normalize(k): v for k, v in self.corrections["phrase_mappings"].items()
            }

    @property
    def skills(self) -> list[str]:
        """[ODIN] Compat bridge for legacy skill counting."""
        # Returns a mock list of length equal to total skills to satisfy len(ve.skills)
        return [""] * self.memory_db.get_total_skills()

    @property
    def vocab(self) -> set[str]:
        """[ODIN] Returns the set of unique tokens in the thesaurus."""
        v = set(self.thesaurus.keys())
        for syns in self.thesaurus.values():
            v.update(syns)
        return v

    @property
    def vectors(self) -> list[int]:
        """[ODIN] Returns a mock list of length equal to total vectors."""
        return [0] * self.memory_db.get_total_skills()

    def normalize(self, text: str) -> str:
        return self.calculus_spoke.normalize(text)

    async def search(self, query: str, mode: str = "neural") -> list[dict[str, Any]]:
        query_norm = self.normalize(query)
        if query_norm in self._search_cache:
            return self._get_cached_search(query_norm)

        # 1. Lexical Fast-Paths
        if query_norm in self.corrections.get("phrase_mappings", {}):
            trigger = self.corrections["phrase_mappings"][query_norm]
            return [{"trigger": trigger, "score": 1.5, "note": "Correction mapped", "is_global": trigger.startswith("GLOBAL:")}]

        # 2. Shadow Search
        shadow_results = self.shadow_spoke.search(query_norm)
        if shadow_results and shadow_results[0]["score"] >= 0.95: # Very high confidence shadow
            cached_results = shadow_results[:5]
            self._set_cached_search(query_norm, cached_results)
            return cached_results

        # 3. Targeted Semantic Search
        top_domain = self.router_spoke.get_top_domain(query_norm, query)
        results = self.memory_db.search_intent("system", query_norm, n_results=10, domain=top_domain)

        if not results:
            return shadow_results[:5] if shadow_results else []

        # 4. Neural Re-ranking (The "Mind")
        # Only re-rank if there's potential ambiguity and we are not in heuristic mode
        if len(results) > 1 and mode != "heuristic":
            results = await self._neural_rerank(query, results)

        # 5. Final Hybrid Scoring
        original_tokens = set(query_norm.split())
        expansion = self.calculus_spoke.expand_query(original_tokens)
        all_expanded = set().union(*expansion.values())

        final_results = [
            self.calculus_spoke.score_intent(r, expansion, original_tokens, all_expanded)
            for r in results
        ]

        final_results.sort(key=lambda x: x['score'], reverse=True)
        self._set_cached_search(query_norm, final_results)
        return final_results

    def _get_cached_search(self, query_norm: str) -> list[dict[str, Any]]:
        results = self._search_cache.pop(query_norm)
        self._search_cache[query_norm] = results
        return results

    def _set_cached_search(self, query_norm: str, results: list[dict[str, Any]]) -> None:
        if query_norm in self._search_cache:
            self._search_cache.pop(query_norm)
        self._search_cache[query_norm] = results
        while len(self._search_cache) > self.SEARCH_CACHE_MAXSIZE:
            self._search_cache.popitem(last=False)

    async def _neural_rerank(self, query: str, candidates: list[dict]) -> list[dict]:
        """Reject the retired direct provider-backed reranking path."""
        del query, candidates
        raise RuntimeError(LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR)

    def load_core_skills(self) -> None:
        """[Ω] Load Core Workflows from .agents/workflows."""
        self.load_skills_from_dir(self.project_root / ".agents" / "workflows")

    def add_skill(self, trigger: str, text: str, domain: str = "GENERAL") -> None:
        self.ingest_spoke.add_skill(trigger, text, domain)

    def load_skills_from_dir(self, directory: str | Path, prefix: str = "") -> None:
        self.ingest_spoke.load_skills_from_dir(directory, prefix)

    def build_index(self) -> None:
        self.shadow_spoke.build_index()

    def clear_active_ram(self) -> None:
        self._search_cache.clear()
        VectorCalculus._GLOBAL_NORM_CACHE.clear()
        VectorCalculus._GLOBAL_EXPANSION_CACHE.clear()
