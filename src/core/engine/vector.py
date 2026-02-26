"""
[ENGINE] Semantic Vector Router
Lore: "The navigation charts of the Bifröst."
Purpose: Unified semantic router for intent resolution using transformer-based embeddings.
"""

import json
import re
from pathlib import Path
from typing import Any

from src.core.engine.memory_db import MemoryDB
from src.core.sovereign_hud import SovereignHUD


class SovereignVector:
    """
    [ODIN] Unified Semantic Router for Corvus Star.
    Acts as a bridge to MemoryDB (ChromaDB) for intent resolution.
    """
    def __init__(
        self,
        thesaurus_path: str | Path | None = None,
        corrections_path: str | Path | None = None,
        stopwords_path: str | Path | None = None
    ) -> None:
        """
        Initializes the vector engine with paths to thesaurus, corrections, and stopwords.
        
        Args:
            thesaurus_path: Path to the thesaurus .qmd file.
            corrections_path: Path to the corrections .json file.
            stopwords_path: Path to the stopwords .json file.
        """
        # Resolve project root (vector.py is in src/core/engine/)
        self.project_root: Path = Path(__file__).resolve().parents[3]

        self.memory_db = MemoryDB(str(self.project_root))
        self._search_cache: dict[str, list[dict[str, Any]]] = {}

        # Set intelligent defaults
        t_path = Path(thesaurus_path) if thesaurus_path else self.project_root / "src" / "data" / "thesaurus.qmd"
        s_path = Path(stopwords_path) if stopwords_path else self.project_root / "src" / "data" / "stopwords.json"
        c_path = Path(corrections_path) if corrections_path else self.project_root / ".agent" / "corrections.json"

        # Load constraints
        self.stopwords: set[str] = self._load_stopwords(s_path)
        self.corrections: dict[str, Any] = self._load_json(c_path) or {"phrase_mappings": {}, "synonym_updates": {}}

        # Normalize phrase mapping keys
        if "phrase_mappings" in self.corrections:
            normalized_mappings = {}
            for original_key, trigger in self.corrections["phrase_mappings"].items():
                normalized_mappings[self.normalize(original_key)] = trigger
            self.corrections["phrase_mappings"] = normalized_mappings

        # Load Thesaurus
        self.thesaurus: dict[str, set[str]] = self._load_thesaurus(t_path)

    def _load_json(self, path: Path) -> dict[str, Any]:
        """Loads a JSON file from disk."""
        if not path.exists():
            return {}
        try:
            return json.loads(path.read_text(encoding='utf-8'))
        except (json.JSONDecodeError, OSError):
            return {}

    def _load_stopwords(self, path: Path) -> set[str]:
        """Loads stopwords from a JSON file, with internal fallbacks."""
        defaults = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
            'is', 'are', 'was', 'were', 'be', 'been', 'it', 'this', 'that', 'these', 'those',
            'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
            'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
            'some', 'any', 'no', 'not', 'do', 'does', 'did', 'done', 'will', 'would', 'shall', 'should',
            'can', 'could', 'may', 'might', 'must', 'have', 'has', 'had'
        }
        if not path.exists():
            return defaults
        try:
            loaded = set(json.loads(path.read_text(encoding='utf-8')))
            return loaded if loaded else defaults
        except (json.JSONDecodeError, OSError, TypeError):
            return defaults

    def _load_thesaurus(self, path: Path) -> dict[str, set[str]]:
        """Parses the .qmd thesaurus bullet points into a bi-directional lookup."""
        if not path.exists():
            return {}

        mapping: dict[str, set[str]] = {}
        try:
            content = path.read_text(encoding='utf-8')
            # Support for Bullet points like: - **key**: val1, val2
            matches = re.findall(r'^- \*\*([^*]+)\*\*:\s*(.*)$', content, re.MULTILINE)
            for cluster_raw, syn_str in matches:
                header = cluster_raw.strip().lower()
                synonyms = [s.strip().lower() for s in syn_str.split(',')]

                full_cluster = set([header] + synonyms)
                for word in full_cluster:
                    if word not in mapping:
                        mapping[word] = set()
                    mapping[word].update(full_cluster)

            return mapping
        except Exception as e:
            SovereignHUD.persona_log("FAIL", f"Thesaurus breach: {e}")
            return {}

    def clear_active_ram(self) -> None:
        """Purges internal caches to signal for garbage collection."""
        self._search_cache.clear()
        SovereignHUD.persona_log("INFO", "SovereignVector: Active RAM cache purged.")

    def normalize(self, text: str) -> str:
        """
        Normalizes a string for search matching.
        Strips noise while preserving command symbols.
        """
        if not text:
            return ""
        text = text.lower().strip()
        text = re.sub(r'[^\w\s\/\-]', '', text)
        words = text.split()
        return " ".join([w for w in words if w not in self.stopwords])

    def _expand_query(self, tokens: set[str]) -> dict[str, set[str]]:
        """Builds a query expansion map using the thesaurus."""
        expansion_map: dict[str, set[str]] = {}
        for token in tokens:
            expansion = {token}
            if token in self.thesaurus:
                for syn in self.thesaurus[token]:
                    expansion.update(syn.replace('-', ' ').replace('_', ' ').lower().split())
            expansion_map[token] = expansion
        return expansion_map

    def _score_intent(self, r: dict[str, Any], query_word_expansion: dict[str, set[str]], original_tokens: set[str]) -> dict[str, Any]:
        """Calculates the hybrid score for a single intent candidate."""
        intent_id: str = r['trigger']
        semantic_score: float = r['score']
        is_global: bool = intent_id.startswith("GLOBAL:")

        # Identity Mapping
        intent_tokens = set(intent_id.replace('/', ' ').replace('-', ' ').replace('_', ' ').lower().split())

        # Coverage & Density
        matched_query_words = 0
        for expansion in query_word_expansion.values():
            if any(syn in intent_tokens for syn in expansion):
                matched_query_words += 1

        matched_intent_tokens = 0
        all_expanded_query_tokens = set().union(*query_word_expansion.values())
        for intent_token in intent_tokens:
            if intent_token in all_expanded_query_tokens:
                matched_intent_tokens += 1

        q_coverage = matched_query_words / len(original_tokens) if original_tokens else 0.0
        i_density = matched_intent_tokens / len(intent_tokens) if intent_tokens else 0.0

        lexical_evidence = (q_coverage * 0.5) + (i_density * 0.5)
        score = self._apply_boosts(semantic_score, lexical_evidence, matched_query_words, q_coverage)

        # Normalize trigger format
        trigger = intent_id if intent_id.startswith("/") or intent_id == "SovereignFish" or intent_id.startswith("GLOBAL:") else f"/{intent_id}"

        if (trigger.startswith("/") or trigger == "SovereignFish") and not is_global:
            score *= 1.2

        return {
            "trigger": trigger,
            "score": score,
            "is_global": is_global,
            "note": f"Hybrid (Sem:{semantic_score:.2f}, Lex:{lexical_evidence:.2f}, Hits:{matched_query_words})"
        }

    def _apply_boosts(self, semantic_score: float, lexical_evidence: float, matched_query_words: int, q_coverage: float) -> float:
        """Isolates the boosting logic for hybrid scoring."""
        if matched_query_words == 0:
            return semantic_score

        boost_factor = 1.5 + (lexical_evidence * 1.5)
        score = semantic_score * boost_factor

        if matched_query_words >= 2 and lexical_evidence >= 0.7:
            score = max(score, 1.40 + (lexical_evidence * 0.1))
        elif lexical_evidence >= 0.8:
            score = max(score, 0.75 + (lexical_evidence * 0.2))
        else:
            score = max(score, 0.55 + (lexical_evidence * 0.15))

        if matched_query_words >= 2 and q_coverage >= 0.8:
            score = max(score, 1.50)

        return score

    def search(self, query: str) -> list[dict[str, Any]]:
        """
        Performs hybrid semantic lookup with lexical boosting.
        
        Args:
            query: The user query string.
            
        Returns:
            A sorted list of boosted search results.
        """
        # 0. Check Search Cache
        query_norm = self.normalize(query)
        if query_norm in self._search_cache:
            return self._search_cache[query_norm]

        # 1. Check direct phrase mappings
        if query_norm in self.corrections.get("phrase_mappings", {}):
            trigger = self.corrections["phrase_mappings"][query_norm]
            is_global = trigger.startswith("GLOBAL:") if trigger else False
            res = [{"trigger": trigger, "score": 1.1, "note": "Correction mapped", "is_global": is_global}]
            self._search_cache[query_norm] = res
            return res

        # 2. Semantic Search
        results = self.memory_db.search_intent("system", query, n_results=30)

        original_tokens = set(query_norm.split())
        query_word_expansion = self._expand_query(original_tokens)

        final_results = [
            self._score_intent(r, query_word_expansion, original_tokens)
            for r in results
        ]

        # Sort by final boosted score
        final_results.sort(key=lambda x: x['score'], reverse=True)

        # Cache and Finish
        self._search_cache[query_norm] = final_results
        return final_results

    def load_core_skills(self) -> None:
        """Registers foundational system intents into the semantic brain."""
        core_skills = {
            "SovereignFish": "Automated code aesthetics, UI polish, design refinement, and SovereignFish protocol execution.",
            "lets-go": "Resume the current development session, identify priorities, and start the agent loop.",
            "run-task": "Execute a specific task, build a feature, or implement a logic change.",
            "investigate": "Deeply analyze the codebase, debug failures, and audit structural integrity.",
            "plan": "Architect the system, create blueprints, and design implementation roadmaps.",
            "test": "Verify code integrity, run regression suites, and validate performance metrics.",
            "wrap-it-up": "Finalize the session, update documentation, and execute the handshake protocol.",
            "oracle": "Consult the Corvus Star oracle for tactical guidance and system state analysis."
        }
        for trigger, text in core_skills.items():
            self.add_skill(trigger, text)

    def load_skills_from_dir(self, directory: str | Path, prefix: str = "") -> None:
        """Recursively discovers and ingests skills from .qmd, .md, or .json files."""
        dir_path = Path(directory)
        if not dir_path.exists():
            return

        for path in dir_path.rglob("*"):
            if path.suffix in [".qmd", ".md"]:
                try:
                    content = path.read_text(encoding='utf-8')
                    skill_id = path.parent.name if path.name.lower() == "skill.qmd" else path.stem
                    trigger = f"{prefix}:{skill_id}" if prefix else skill_id
                    self.add_skill(trigger, content)
                except Exception as e:
                    SovereignHUD.persona_log("WARN", f"Failed to ingest skill {path.name}: {e}")
            elif path.suffix == ".json":
                try:
                    data = json.loads(path.read_text(encoding='utf-8'))
                    if isinstance(data, list):
                        for item in data:
                            trigger = item.get("trigger")
                            text = item.get("description") or item.get("text")
                            if trigger and text:
                                full_trigger = f"{prefix}:{trigger}" if prefix else trigger
                                self.add_skill(full_trigger, text)
                    elif isinstance(data, dict):
                        trigger = data.get("trigger")
                        text = data.get("description") or data.get("text")
                        if trigger and text:
                            full_trigger = f"{prefix}:{trigger}" if prefix else trigger
                            self.add_skill(full_trigger, text)
                except Exception as e:
                    SovereignHUD.persona_log("WARN", f"Failed to ingest .json skill {path.name}: {e}")

    def build_index(self) -> None:
        """Finalizes the semantic index."""
        SovereignHUD.persona_log("HEIMDALL", "Semantic Indexing Synchronized.")

    def add_skill(self, trigger: str, text: str) -> None:
        """Bridges to MemoryDB for intent persistence."""
        self.memory_db.upsert_skill("system", trigger, text)
