import json
import os
import re
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent.parent.parent.absolute()
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.core.sovereign_hud import SovereignHUD
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

    def _load_thesaurus(self, path: str | Path | None) -> dict[str, set[str]]:
        """[ALFRED] Parses the .qmd thesaurus bullet points into a bi-directional lookup."""
        if not path: return {}
        p = Path(path)
        if not p.exists(): return {}
        
        mapping = {}
        try:
            content = p.read_text(encoding='utf-8')
            # [ODIN] Support for Bullet points like: - **key**: val1, val2
            matches = re.findall(r'^- \*\*([^*]+)\*\*:\s*(.*)$', content, re.MULTILINE)
            for cluster_raw, syn_str in matches:
                header = cluster_raw.strip().lower()
                synonyms = [s.strip().lower() for s in syn_str.split(',')]
                
                full_cluster = set([header] + synonyms)
                # Every word in the cluster points to the whole set
                for word in full_cluster:
                    if word not in mapping:
                        mapping[word] = set()
                    mapping[word].update(full_cluster)
            
            return mapping
        except Exception as e:
            SovereignHUD.persona_log("FAIL", f"Thesaurus breach: {e}")
            return {}

    def clear_active_ram(self):
        """[V4] Explicitly purges internal caches to signal for GC."""
        self._search_cache.clear()
        SovereignHUD.persona_log("INFO", "SovereignVector: Active RAM cache purged.")

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

        # 2. Semantic Search (Fetch top 30 candidates for wider hybrid recall)
        results = self.memory_db.search_intent("system", query, n_results=30)
        
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
            intent_tokens = set(intent_id.replace('/', ' ').replace('-', ' ').replace('_', ' ').lower().split())
            
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
                    score = max(score, 1.40 + (lexical_evidence * 0.1))
                elif lexical_evidence >= 0.8:
                    # Very strong single-cluster hit -> High Confidence
                    score = max(score, 0.75 + (lexical_evidence * 0.2))
                else:
                    # At least one keyword hit -> Moderate boost
                    score = max(score, 0.55 + (lexical_evidence * 0.15))
                    
                # Extra weight for multi-word intents that are fully satisfied
                if matched_query_words >= 2 and q_coverage >= 0.8:
                    score = max(score, 1.50)
            else:
                score = semantic_score

            # Normalize to trigger format
            trigger = intent_id if intent_id.startswith("/") or intent_id == "SovereignFish" or intent_id.startswith("GLOBAL:") else f"/{intent_id}"
            
            # Sovereign Priority (Tie-breaker)
            if (trigger.startswith("/") or trigger == "SovereignFish") and not is_global:
                score *= 1.2 # Stronger priority for primary system intents

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
    def load_core_skills(self):
        """[ODIN] Registers foundational system intents into the semantic brain."""
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

    def load_skills_from_dir(self, directory: str | Path, prefix: str = ""):
        """[ALFRED] Recursively discovers and ingests skills from .qmd or .json files."""
        dir_path = Path(directory)
        if not dir_path.exists():
            return

        for path in dir_path.rglob("*"):
            if path.suffix in [".qmd", ".md"]:
                # Parse .qmd skill (Heuristic: Look for 'Activation Words' and 'Instructions')
                try:
                    content = path.read_text(encoding='utf-8')
                    # Skill ID is the directory name or filename
                    skill_id = path.parent.name if path.name.lower() == "skill.qmd" else path.stem
                    if prefix:
                        trigger = f"{prefix}:{skill_id}"
                    else:
                        trigger = skill_id
                    
                    self.add_skill(trigger, content)
                except Exception as e:
                    SovereignHUD.persona_log("WARN", f"Failed to ingest .qmd skill {path.name}: {e}")
            elif path.suffix == ".json":
                try:
                    data = json.loads(path.read_text(encoding='utf-8'))
                    if isinstance(data, list):
                        for item in data:
                            trigger = item.get("trigger")
                            text = item.get("description") or item.get("text")
                            if trigger and text:
                                if prefix:
                                    trigger = f"{prefix}:{trigger}"
                                self.add_skill(trigger, text)
                    elif isinstance(data, dict):
                        trigger = data.get("trigger")
                        text = data.get("description") or data.get("text")
                        if trigger and text:
                            if prefix:
                                trigger = f"{prefix}:{trigger}"
                            self.add_skill(trigger, text)
                except Exception as e:
                    SovereignHUD.persona_log("WARN", f"Failed to ingest .json skill {path.name}: {e}")

    def build_index(self):
        """[ALFRED] Finalizes the semantic index. (ChromaDB handles this automatically per upsert)."""
        SovereignHUD.persona_log("HEIMDALL", "Semantic Indexing Synchronized.")

    def add_skill(self, trigger: str, text: str):
        """[ALFRED] Bridges to MemoryDB for intent persistence."""
        self.memory_db.upsert_skill("system", trigger, text)