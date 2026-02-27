"""
[ENGINE] Semantic Vector Router
Lore: "The navigation charts of the Bifröst."
Purpose: Unified semantic router for intent resolution using transformer-based embeddings.
"""

import json
import os
import re
from pathlib import Path
from typing import Any

from src.core.engine.memory_db import MemoryDB
from src.core.engine.instruction_loader import InstructionLoader
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
        self.instruction_loader = InstructionLoader(str(self.project_root))
        self._search_cache: dict[str, list[dict[str, Any]]] = {}
        self._expansion_cache: dict[str, set[str]] = {}
        
        # [ALFRED] Shadow Engine: In-memory lexical search for 0.06ms latency
        self._shadow_index: dict[str, dict[str, Any]] = {}

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
            'can', 'could', 'may', 'might', 'must', 'have', 'has', 'had',
            'up', 'please', 'want', 'our', 'now', 'today', 'help', 'time', 'need', 'go', 'ahead', 'exec'
        }
        if not path.exists():
            return defaults
        try:
            loaded = set(json.loads(path.read_text(encoding='utf-8')))
            return loaded.union(defaults)
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
        """Builds a query expansion map using the thesaurus, with caching."""
        expansion_map: dict[str, set[str]] = {}
        for token in tokens:
            if token in self._expansion_cache:
                expansion_map[token] = self._expansion_cache[token]
                continue

            expansion = {token}
            if token in self.thesaurus:
                for syn in self.thesaurus[token]:
                    expansion.update(syn.replace('-', ' ').replace('_', ' ').lower().split())
            
            self._expansion_cache[token] = expansion
            expansion_map[token] = expansion
        return expansion_map

    def _score_intent(self, r: dict[str, Any], query_word_expansion: dict[str, set[str]], original_tokens: set[str], all_expanded_query_tokens: set[str]) -> dict[str, Any]:
        """Calculates the hybrid score for a single intent candidate with High Confidence Floors."""
        intent_id: str = r['trigger']
        semantic_score: float = r['score']
        is_global: bool = intent_id.startswith("GLOBAL:")

        # Identity Mapping
        intent_tokens = set(intent_id.replace('/', ' ').replace('-', ' ').replace('_', ' ').lower().split())

        # Coverage & Density
        matched_query_words = 0
        has_identity_match = False
        for q_token, expansion in query_word_expansion.items():
            is_match = any(syn in intent_tokens for syn in expansion)
            if is_match:
                matched_query_words += 1
                if q_token in intent_tokens and q_token not in self.stopwords:
                    has_identity_match = True

        matched_intent_tokens = 0
        for intent_token in intent_tokens:
            if intent_token in all_expanded_query_tokens:
                matched_intent_tokens += 1

        q_coverage = matched_query_words / len(original_tokens) if original_tokens else 0.0
        i_density = matched_intent_tokens / len(intent_tokens) if intent_tokens else 0.0

        lexical_evidence = (q_coverage * 0.5) + (i_density * 0.5)
        
        # [ALFRED] High-Confidence Floor Logic
        # If identity match exists, start at 0.95
        if has_identity_match:
            score = max(0.95, semantic_score + 0.5)
        else:
            score = self._apply_boosts(semantic_score, lexical_evidence, matched_query_words, q_coverage)

        # Ensure strong lexical evidence hits the 0.80 mark
        if lexical_evidence >= 0.75:
            score = max(score, 0.85)

        # Normalize trigger format
        trigger = intent_id if intent_id.startswith("/") or intent_id == "SovereignFish" or intent_id.startswith("GLOBAL:") else f"/{intent_id}"

        # [ALFRED] Final balancing boost for core/global intents
        if trigger.startswith("/") or trigger == "SovereignFish" or is_global:
            score *= 1.15

        # Cap at 1.99 for audit clarity
        score = min(1.99, score)

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
        Performs Hierarchical Semantic Routing with Shadow Engine Fast-Path.
        """
        # 0. Check Search Cache
        query_norm = self.normalize(query)
        if query_norm in self._search_cache:
            return self._search_cache[query_norm]

        # 1. Check direct phrase mappings
        if query_norm in self.corrections.get("phrase_mappings", {}):
            trigger = self.corrections["phrase_mappings"][query_norm]
            is_global = trigger.startswith("GLOBAL:") if trigger else False
            res = [{"trigger": trigger, "score": 1.5, "note": "Correction mapped", "is_global": is_global}]
            self._search_cache[query_norm] = res
            return res

        # 2. [ALFRED] Lexical Fast-Path: Exact Trigger or Core Synonym match
        tokens = query_norm.split()
        if len(tokens) <= 3:
            token_str = "".join(tokens)
            fast_map = {
                "letsgo": "/lets-go", "start": "/lets-go", "begin": "/lets-go",
                "runtask": "/run-task", "build": "/run-task", "create": "/run-task",
                "investigate": "/investigate", "debug": "/investigate", "audit": "/investigate",
                "plan": "/plan", "design": "/plan", "architect": "/plan",
                "test": "/test", "verify": "/test", "validate": "/test",
                "wrapitup": "/wrap-it-up", "finish": "/wrap-it-up", "finalize": "/wrap-it-up",
                "sovereignfish": "SovereignFish", "polish": "SovereignFish", "beautify": "SovereignFish",
                "oracle": "/oracle"
            }
            if token_str in fast_map:
                trigger = fast_map[token_str]
                res = [{"trigger": trigger, "score": 1.6, "note": "Fast-Path: Lexical Identity", "is_global": False}]
                self._search_cache[query_norm] = res
                return res

        # 3. [ALFRED] Expanded Shadow Engine Fast-Path
        shadow_results = self._shadow_search(query_norm)
        if shadow_results and shadow_results[0]["score"] >= 0.80:
            self._search_cache[query_norm] = shadow_results[:5]
            return shadow_results[:5]

        # 4. [TIER 1] Domain Identification with Fast-Path & Contextual Gravity
        top_domain = None
        
        # [ALFRED] Lexical Domain Fast-Path: Quick-route definitive keywords
        domain_hot_tokens = {
            "UI": ["visual", "polish", "aesthetic", "design", "layout", "neon", "glow", "holographic", "glass", "sci-fi", "futuristic"],
            "INFRA": ["deploy", "production", "release", "publish", "ship", "server", "cloud", "instance"],
            "DEV": ["git", "commit", "push", "pull", "merge", "branch", "debug", "investigate", "audit", "fix", "bug", "error", "test", "verify", "validate"],
            "STATS": ["health", "monitor", "metrics", "performance", "latency", "speed", "optimization", "accelerate", "benchmark"]
        }
        
        for d_id, hot_tokens in domain_hot_tokens.items():
            if any(ht in query_norm for ht in hot_tokens):
                top_domain = d_id
                break

        if not top_domain:
            # Fallback to Semantic Domain Search
            domain_results = self.memory_db.search_intent("system", query, n_results=10)
            
            # Aggregate domain scores
            domain_scores = {}
            for r in domain_results:
                d = r.get("domain", "GENERAL")
                domain_scores[d] = domain_scores.get(d, 0.0) + r["score"]
            
            # Apply Contextual Gravity
            cwd = os.getcwd().lower()
            gravity_map = {
                "src/ui": "UI", "components": "UI", "style": "UI",
                "scripts": "DEV", "tests": "DEV", "test": "DEV",
                "infra": "INFRA", "docker": "INFRA", ".github": "INFRA",
                "stats": "STATS", "logs": "STATS"
            }
            for path_key, target_domain in gravity_map.items():
                if path_key in cwd.replace("\\", "/"):
                    if target_domain in domain_scores:
                        domain_scores[target_domain] *= 1.25 # 25% Boost
                    else:
                        domain_scores[target_domain] = 0.5 # Baseline for relevant domain
            
            if domain_scores:
                top_domain = max(domain_scores, key=domain_scores.get)
            else:
                top_domain = "GENERAL"

        # 5. [TIER 2] Targeted Skill Search
        # Search specifically within the identified domain for high precision
        results = self.memory_db.search_intent("system", query, n_results=30, domain=top_domain)

        # 6. Hybrid Scoring & Expansion
        original_tokens = set(tokens)
        query_word_expansion = self._expand_query(original_tokens)
        all_expanded_query_tokens = set().union(*query_word_expansion.values())

        final_results = [
            self._score_intent(r, query_word_expansion, original_tokens, all_expanded_query_tokens)
            for r in results
        ]

        # 7. Fallback: If top result is weak, try a broad search
        if not final_results or final_results[0]["score"] < 0.6:
            broad_results = self.memory_db.search_intent("system", query, n_results=10) # broad
            for r in broad_results:
                if r["trigger"] not in [fr["trigger"] for fr in final_results]:
                    final_results.append(self._score_intent(r, query_word_expansion, original_tokens, all_expanded_query_tokens))

        # Sort and return
        final_results.sort(key=lambda x: x['score'], reverse=True)
        self._search_cache[query_norm] = final_results
        return final_results

    def load_core_skills(self) -> None:
        """Registers foundational system intents into the semantic brain with Domain partitioning."""
        core_skills = {
            "SovereignFish": ("Automated code aesthetics, polish, refinement, and SovereignFish protocol execution. synonyms: beautify, improve, clean, formatting, layout, polish, refine, standardize. visuals, aesthetics, ui, design, layout, code style", "UI"),
            "lets-go": ("Resume the current development session, identify priorities, and start the agent loop. synonyms: begin, start, resume, initiate, kick-off, fire-up, lets-go, workspace. project, session, work, environment", "CORE"),
            "run-task": ("Execute a specific task, build a feature, construct, implement, or create a logic change. synonyms: build, create, implement, make, generate, construct, develop, update. page, component, feature, logic, api, endpoint", "CORE"),
            "investigate": ("Deeply analyze the codebase, troubleshoot failures, and debug structural integrity. synonyms: analyze, diagnose, debug, investigate, examine, trace, troubleshoot, hunt. bug, issue, error, auth, crash, latency, failure, anomaly, diagnostic", "DEV"),
            "plan": ("Architect the system, create blueprints, and design implementation roadmaps. synonyms: architect, blueprint, design, plan, roadmap, strategy, outline. system, architecture, strategy, implementation, module, strategize", "CORE"),
            "test": ("Verify code integrity, run regression suites, and validate execution metrics. synonyms: verify, validate, test, check, benchmark, smoke-test. code, integrity, coverage, reliability", "DEV"),
            "wrap-it-up": ("Finalize the session, update documentation, and execute the handshake protocol. synonyms: finish, finalize, wrap, close, end, call-it-a-day, conclude. task, complete, stop, shutdown, archive", "CORE"),
            "oracle": ("Consult the Corvus Star oracle for tactical guidance and system state analysis.", "CORE")
        }
        for trigger, (text, domain) in core_skills.items():
            self.add_skill(trigger, text, domain=domain)

    def load_skills_from_dir(self, directory: str | Path, prefix: str = "") -> None:
        """Recursively discovers and ingests skills from .qmd, .md, or .json files with Domain mapping."""
        dir_path = Path(directory)
        if not dir_path.exists():
            return

        # Simple Domain Mapping based on folder structure
        domain_map = {
            "ui": "UI",
            "visuals": "UI",
            "infra": "INFRA",
            "deployment": "INFRA",
            "environment": "INFRA",
            "dev": "DEV",
            "git": "DEV",
            "testing": "DEV",
            "stats": "STATS",
            "health": "STATS",
            "lightning": "STATS"
        }

        for path in dir_path.rglob("*"):
            # Determine domain from parent folder
            domain = "GENERAL"
            parent_name = path.parent.name.lower()
            for key, val in domain_map.items():
                if key in parent_name:
                    domain = val
                    break

            if path.suffix in [".qmd", ".md"]:
                try:
                    content = path.read_text(encoding='utf-8')
                    skill_id = path.parent.name if path.name.lower() == "skill.qmd" else path.stem
                    
                    if prefix:
                        trigger = f"{prefix}{skill_id}" if prefix.endswith(":") else f"{prefix}:{skill_id}"
                    else:
                        trigger = skill_id
                    
                    self.add_skill(trigger, content, domain=domain)
                except Exception as e:
                    SovereignHUD.persona_log("WARN", f"Failed to ingest skill {path.name}: {e}")
            elif path.suffix == ".json":
                try:
                    data = json.loads(path.read_text(encoding='utf-8'))
                    items = data if isinstance(data, list) else [data]
                    for item in items:
                        trigger = item.get("trigger")
                        text = item.get("description") or item.get("text")
                        if trigger and text:
                            full_trigger = f"{prefix}{trigger}" if prefix and not prefix.endswith(":") else f"{prefix}:{trigger}" if prefix else trigger
                            # [ALFRED] Handle potential prefix double-colon again just in case
                            if prefix and prefix.endswith(":"):
                                full_trigger = f"{prefix}{trigger}"

                            self.add_skill(full_trigger, text, domain=domain)
                except Exception as e:
                    SovereignHUD.persona_log("WARN", f"Failed to ingest .json skill {path.name}: {e}")

    def build_index(self) -> None:
        """Finalizes the semantic index and warms the Shadow Engine with TF-IDF."""
        # [ALFRED] Warm the Shadow Engine (TF-IDF Lexical Cache)
        all_skills = self.memory_db.search_intent("system", "", n_results=1000)
        
        doc_freq = {}
        total_docs = len(all_skills)
        
        for s in all_skills:
            trigger = s["trigger"]
            doc = s["description"].lower()
            
            # Extract activation words
            activation_text = ""
            syn_match = re.search(r'synonyms:\s*(.*)', doc)
            if syn_match: activation_text += syn_match.group(1) + " "
            act_match = re.search(r'(?:activation words|keywords):?\s*(.*)', doc, re.IGNORECASE)
            if act_match: activation_text += act_match.group(1) + " "
            trigger_clean = trigger.replace("/", " ").replace("-", " ").replace("global:", "").replace("_", " ")
            activation_text += trigger_clean

            tokens = set(re.findall(r'\w+', activation_text))
            
            for t in tokens:
                doc_freq[t] = doc_freq.get(t, 0) + 1
            
            self._shadow_index[trigger] = {
                "trigger": trigger,
                "tokens": tokens,
                "domain": s.get("domain", "GENERAL"),
                "description": s["description"]
            }

        import math
        self._idf_map = {t: math.log(total_docs / (1 + freq)) for t, freq in doc_freq.items()}

        SovereignHUD.persona_log("HEIMDALL", f"Semantic Indexing Synchronized. Shadow Engine: {len(self._shadow_index)} skills.")

    def _shadow_search(self, query: str) -> list[dict[str, Any]]:
        """Performs a lightning-fast TF-IDF lexical search."""
        q_tokens = set(re.findall(r'\w+', query.lower()))
        q_tokens = {t for t in q_tokens if t not in self.stopwords}
        
        if not q_tokens: 
            return []

        expanded_q_tokens = set()
        q_token_to_expanded = {}
        for token in q_tokens:
            expansion = {token}
            if token in self._expansion_cache:
                expansion.update(self._expansion_cache[token])
            elif token in self.thesaurus:
                for syn in self.thesaurus[token]:
                    expansion.update(syn.replace('-', ' ').replace('_', ' ').lower().split())
                self._expansion_cache[token] = expansion
            
            expanded_q_tokens.update(expansion)
            q_token_to_expanded[token] = expansion

        results = []
        for trigger, data in self._shadow_index.items():
            intersection = expanded_q_tokens.intersection(data["tokens"])
            if not intersection:
                continue
                
            matched_q_words = 0
            tfidf_score = 0.0
            max_possible_tfidf = sum(self._idf_map.get(t, 1.0) for t in q_tokens)
            has_identity = False
            
            trigger_clean = trigger.lower().replace("/", "").replace("-", "").replace("global:", "")
            trigger_parts = set(trigger_clean.split())
            
            for q_token in q_tokens:
                q_expanded = q_token_to_expanded[q_token]
                match_subset = q_expanded.intersection(data["tokens"])
                if match_subset:
                    matched_q_words += 1
                    # Give it the max IDF of the matched synonyms for this query token
                    best_idf = max(self._idf_map.get(m, 1.0) for m in match_subset)
                    tfidf_score += best_idf
                    
                if q_token in trigger_parts or q_token == trigger_clean:
                    has_identity = True

            if matched_q_words > 0:
                q_coverage = matched_q_words / len(q_tokens)
                e_density = len(intersection) / len(data["tokens"]) if data["tokens"] else 0.0
                
                # Base score is normalized TF-IDF sum
                lex_score = (tfidf_score / max_possible_tfidf) if max_possible_tfidf > 0 else 0
                
                # Weight with density to break ties
                lex_score = (lex_score * 0.8) + (e_density * 0.2)
                
                # Multipliers
                if has_identity:
                    lex_score *= 1.4
                elif q_coverage == 1.0:
                    lex_score *= 1.25
                elif q_coverage >= 0.5:
                    lex_score *= 1.1
                    
                is_global = trigger.startswith("GLOBAL:")
                final_trigger = trigger
                if not final_trigger.startswith("/") and final_trigger != "SovereignFish" and not is_global:
                    final_trigger = f"/{final_trigger}"
                    
                core_intents = {"/lets-go", "/run-task", "/investigate", "/plan", "/test", "/wrap-it-up", "SovereignFish", "/oracle"}
                if final_trigger in core_intents or is_global:
                    lex_score *= 1.25 # Boost core/global over local overlaps
                    
                lex_score = min(1.99, lex_score)

                results.append({
                    "trigger": final_trigger,
                    "score": lex_score,
                    "domain": data["domain"],
                    "description": data["description"],
                    "note": f"Shadow TF-IDF (Cov:{q_coverage:.2f})"
                })
        
        results.sort(key=lambda x: x["score"], reverse=True)
        return results

    def add_skill(self, trigger: str, text: str, domain: str = "GENERAL") -> None:
        """Bridges to MemoryDB for intent persistence with Domain metadata."""
        metadata = {"domain": domain}
        self.memory_db.upsert_skill("system", trigger, text, metadata=metadata)
