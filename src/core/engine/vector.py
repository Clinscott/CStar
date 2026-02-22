import json
import os
import re
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent.parent.parent.absolute()
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.core.ui import HUD
from src.core.engine.memory_db import MemoryDB

class SovereignVector:
    """
    [ODIN] Unified Semantic Router for Corvus Star.
    Acts as a bridge to MemoryDB (ChromaDB) for intent resolution.
    Deprecates legacy TF-IDF logic in favor of transformer-based embeddings.
    """
    def __init__(self, thesaurus_path=None, corrections_path=None, stopwords_path=None) -> None:
        self.memory_db = MemoryDB(str(project_root))
        self._search_cache = {} # {query_text: search_results}
        
        # [ALFRED] Set intelligent defaults for required assets
        if not thesaurus_path:
            thesaurus_path = project_root / "src" / "data" / "thesaurus.qmd"
        if not stopwords_path:
            stopwords_path = project_root / "src" / "data" / "stopwords.json"
        if not corrections_path:
            corrections_path = project_root / ".agent" / "corrections.json"

        # Load constraints for normalization/corrections
        self.stopwords = self._load_stopwords(stopwords_path)
        self.corrections = self._load_json(corrections_path) if corrections_path else {"phrase_mappings": {}, "synonym_updates": {}}
        
        # [ODIN] Normalize phrase mapping keys to align with hardened cache strategy
        if "phrase_mappings" in self.corrections:
            normalized_mappings = {}
            for original_key, trigger in self.corrections["phrase_mappings"].items():
                normalized_mappings[self.normalize(original_key)] = trigger
            self.corrections["phrase_mappings"] = normalized_mappings

        # Load Thesaurus
        self.thesaurus = self._load_thesaurus(thesaurus_path)

    def _load_json(self, path: str | Path | None) -> dict:
        if not path: return {}
        p = Path(path)
        if not p.exists(): return {}
        try:
            return json.loads(p.read_text(encoding='utf-8'))
        except (json.JSONDecodeError, IOError, OSError):
            return {}

    def _load_stopwords(self, path: str | Path | None) -> set[str]:
        defaults = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 
            'is', 'are', 'was', 'were', 'be', 'been', 'it', 'this', 'that', 'these', 'those', 
            'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
            'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
            'some', 'any', 'no', 'not', 'do', 'does', 'did', 'done', 'will', 'would', 'shall', 'should',
            'can', 'could', 'may', 'might', 'must', 'have', 'has', 'had'
        }
        if not path: return defaults
        p = Path(path)
        if not p.exists(): return defaults
        try:
            loaded = set(json.loads(p.read_text(encoding='utf-8')))
            return loaded if loaded else defaults
        except (json.JSONDecodeError, IOError, OSError, TypeError):
            return defaults

    def _load_thesaurus(self, path: str | Path | None) -> dict[str, list[str]]:
        """Parses the .qmd thesaurus into a lookup dictionary."""
        if not path: return {}
        p = Path(path)
        if not p.exists(): return {}
        
        mapping = {}
        try:
            content = p.read_text(encoding='utf-8')
            # Extract bullet points like: - **key**: val1, val2
            matches = re.findall(r'^- \*\*([^*]+)\*\*:\s*(.*)$', content, re.MULTILINE)
            for key, val_str in matches:
                # Clean up synonyms
                syns = [s.strip().lower() for s in val_str.split(',')]
                mapping[key.lower().strip()] = syns
            return mapping
        except Exception:
            return {}

    def normalize(self, text: str) -> str:
        """
        [ALFRED] Normalizes a string for CACHE KEY production only.
        Strips noise while preserving command symbols.
        """
        if not text: return ""
        text = text.lower().strip()
        text = re.sub(r'[^\w\s\/\-]', '', text)
        words = text.split()
        # [ALFRED] Note: We don't use trigger_map check here anymore as it's deprecated
        return " ".join([w for w in words if w not in self.stopwords])

    def search(self, query: str) -> list[dict]:
        """
        [ALFRED] Performs hybrid semantic lookup with lexical boosting.
        
        Args:
            query: The raw user input string.
            
        Returns:
            A list of results sorted by confidence.
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

        # 2. Semantic Search (Fetch top 15 candidates for wider hybrid recall)
        results = self.memory_db.search_intent(query, n_results=15)
        
        final_results = []
        original_tokens = set(query_norm.split())
        
        # [ALFRED] Query Expansion Map
        query_word_expansion = {}
        for token in original_tokens:
            expansion = {token}
            if token in self.thesaurus:
                for syn in self.thesaurus[token]:
                    expansion.update(syn.replace('-', ' ').replace('_', ' ').lower().split())
            query_word_expansion[token] = expansion

        for r in results:
            intent_id = r['trigger']
            semantic_score = r['score']
            is_global = intent_id.startswith("GLOBAL:")
            
            # [ALFRED] Identity Mapping
            intent_tokens = set(intent_id.replace('-', ' ').replace('_', ' ').lower().split())
            
            # Query Coverage: How many distinct words in the user's query point to this intent?
            matched_query_words = 0
            for expansion in query_word_expansion.values():
                if any(syn in intent_tokens for syn in expansion):
                    matched_query_words += 1
            
            # Intent Density: How many distinct tokens in the intent ID were matched?
            matched_intent_tokens = 0
            all_expanded_query_tokens = set().union(*query_word_expansion.values())
            for intent_token in intent_tokens:
                if intent_token in all_expanded_query_tokens:
                    matched_intent_tokens += 1
            
            q_coverage = matched_query_words / len(original_tokens) if original_tokens else 0.0
            i_density = matched_intent_tokens / len(intent_tokens) if intent_tokens else 0.0
            
            # [ALFRED] Hybrid Scoring Strategy
            # Lexical Evidence is the sum of coverage and density
            lexical_evidence = (q_coverage * 0.5) + (i_density * 0.5)
            
            if matched_query_words > 0:
                # Base Boost: Scale the semantic score
                boost_factor = 1.5 + (lexical_evidence * 1.5)
                score = semantic_score * boost_factor
                
                # [ALFRED] Sovereign Anchors: High-density lexical insurance
                if matched_query_words >= 2 and lexical_evidence >= 0.7:
                    # Multi-keyword hit -> Definite Intent
                    score = max(score, 1.30 + (lexical_evidence * 0.1))
                    
                elif matched_query_words == 1 and lexical_evidence >= 0.5:
                    # Single-keyword hit -> Moderate boost
                    score = max(score, 0.50 + (lexical_evidence * 0.1))
                    
                # Extra weight for multi-word intents that are fully satisfied
                if matched_query_words >= 2 and q_coverage >= 0.8:
                    score = max(score, 1.50)
            else:
                score = semantic_score

            # Normalize to trigger format
            trigger = intent_id if intent_id.startswith("/") or intent_id == "SovereignFish" else f"/{intent_id}"
            
            # Sovereign Priority (Tie-breaker)
            if (trigger.startswith("/") or trigger == "SovereignFish") and not is_global:
                score *= 1.1

            final_results.append({
                "trigger": trigger,
                "score": score,
                "is_global": is_global,
                "note": f"Hybrid (Sem:{semantic_score:.2f}, Lex:{lexical_evidence:.2f}, Hits:{matched_query_words})"
            })

        # Sort by final boosted score
        final_results.sort(key=lambda x: x['score'], reverse=True)

        # Cache and Finish
        self._search_cache[query_norm] = final_results
        return final_results

    # [ALFRED] Stubs for backward compatibility during transition
    def load_core_skills(self): pass
    def load_skills_from_dir(self, directory, prefix=""): pass
    def build_index(self): pass
    def add_skill(self, trigger, text):
        self.memory_db.upsert_skill(trigger, text)