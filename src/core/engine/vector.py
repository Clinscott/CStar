import json
import math
import os
import re
import sys

# Import Shared UI from parent directory
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent.parent.parent.absolute()
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.core.ui import HUD


class SimilarityStrategy:
    """[ALFRED] Abstract interface for pluggable similarity functions."""
    def compute(self, v1: list[float], v2: list[float]) -> float:
        raise NotImplementedError


class CosineSimilarity(SimilarityStrategy):
    """[ALFRED] Standard cosine similarity — the default strategy."""
    def compute(self, v1: list[float], v2: list[float]) -> float:
        dot = sum(a * b for a, b in zip(v1, v2))
        mag1 = math.sqrt(sum(a * a for a in v1))
        mag2 = math.sqrt(sum(b * b for b in v2))
        if mag1 == 0 or mag2 == 0:
            return 0
        return dot / (mag1 * mag2)


class JaccardSimilarity(SimilarityStrategy):
    """[ODIN] Jaccard-style similarity operating on non-zero vector dimensions."""
    def compute(self, v1: list[float], v2: list[float]) -> float:
        s1 = {i for i, v in enumerate(v1) if v > 0}
        s2 = {i for i, v in enumerate(v2) if v > 0}
        if not s1 and not s2:
            return 0
        return len(s1 & s2) / len(s1 | s2)


class SovereignVector:
    def __init__(self, thesaurus_path=None, corrections_path=None, stopwords_path=None):
        """
        [ALFRED] Initializes the Sovereign Vector Engine.
        Loads the thesaurus, corrections, and stopwords to build the project's intent vocabulary.
        """
        self.thesaurus = self._load_thesaurus(thesaurus_path) if thesaurus_path else {}
        self.corrections = self._load_json(corrections_path) if corrections_path else {"phrase_mappings": {}, "synonym_updates": {}}
        self.stopwords = self._load_stopwords(stopwords_path)
        
        # SovereignFish: Boot Log
        HUD.box_top("ENGINE INITIALIZED")
        HUD.box_row("STATUS", "ONLINE", HUD.GREEN)
        HUD.box_bottom()

        self.skills = {} # {trigger: "full text of skill description"}
        self.trigger_map = {} # {keyword: [triggers]}
        self.vocab = set()
        self.idf = {}
        self.vectors = {} # {trigger: [vector]}
        self._search_cache = {} # {query_text: search_results}
        self._expansion_cache = {} # {query_text: weighted_tokens}
        self._token_cache = {} # {token: {expanded_token: weight}}
        self._similarity_strategy: SimilarityStrategy = CosineSimilarity()

    def _load_json(self, path):
        if not path or not os.path.exists(path): return {}
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def _load_stopwords(self, path):
        defaults = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 
            'is', 'are', 'was', 'were', 'be', 'been', 'it', 'this', 'that', 'these', 'those', 
            'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
            'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
            'some', 'any', 'no', 'not', 'do', 'does', 'did', 'done', 'will', 'would', 'shall', 'should',
            'can', 'could', 'may', 'might', 'must', 'have', 'has', 'had', 'go', 'get', 'make', 'do'
        }
        if not path or not os.path.exists(path): return defaults
        try:
            with open(path, 'r', encoding='utf-8') as f:
                loaded = set(json.load(f))
                return loaded if loaded else defaults
        except (FileNotFoundError, json.JSONDecodeError, TypeError):
            return defaults

    def _load_thesaurus(self, path):
        """[ALFRED] Secure thesaurus loader with weight clamping and correction merging."""
        # [ALFRED] Staged Symbiosis: Support .qmd with .md fallback
        if not path: return {}
        
        actual_path = path
        if not os.path.exists(actual_path):
            if actual_path.endswith('.md'):
                qmd = actual_path.replace('.md', '.qmd')
                if os.path.exists(qmd): actual_path = qmd
            elif actual_path.endswith('.qmd'):
                md = actual_path.replace('.qmd', '.md')
                if os.path.exists(md): actual_path = md
        
        if not os.path.exists(actual_path) or os.path.getsize(actual_path) > 2*10**6: return {}
        try:
            with open(actual_path, 'r', encoding='utf-8') as f: content = f.read()
            mapping = {}
            for word, syns in re.findall(r'- (?:\*\*)?([\w\d\-\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]+)(?:\*\*)?: ([\w\d,\.: \-\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]+)', content):
                syn_dict = {}
                for s in syns.split(','):
                    s = s.strip().lower()
                    if not s: continue
                    name, weight = (s.split(':') + ["1.0"])[:2]
                    try: weight = max(0.1, min(2.0, float(weight)))
                    except (ValueError, TypeError): weight = 1.0
                    syn_dict[name.strip()] = weight
                mapping[word.lower()] = syn_dict
            self._apply_thesaurus_corrections(mapping)
            return mapping
        except (json.JSONDecodeError, IOError, OSError): return {}

    def _apply_thesaurus_corrections(self, mapping):
        """Apply dynamic corrections to the static thesaurus."""
        if not hasattr(self, 'corrections') or not isinstance(self.corrections, dict): return
        for word, syns in self.corrections.get("synonym_updates", {}).items():
            if isinstance(syns, list):
                word_map = mapping.get(word, {})
                for s in syns:
                    if isinstance(s, str): word_map[s] = 1.0
                mapping[word] = word_map

    def tokenize(self, text: str) -> list[str]:
        """
        [ALFRED] Optimized Unicode-aware tokenizer with CJK segmentation and trigger preservation.
        
        Args:
            text: The raw input string to tokenize.
            
        Returns:
            A list of prioritized tokens, preserving command triggers and handling CJK characters.
        """
        if not text: return []
        text = text.lower()
        # [ALFRED] Preserving / and - for direct command matching
        tokens = []
        for match in re.finditer(r'[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]|[\w\d\/\-]+', text):
            tokens.append(match.group())
        
        # Filter stopwords UNLESS the token is a known trigger
        return [t for t in tokens if t not in self.stopwords or t in self.trigger_map] or tokens

    def expand_query(self, query: str) -> dict[str, float]:
        """[ALFRED] Neural Query Expansion with stemming and thesaurus signals."""
        tokens = self.tokenize(query)
        weights = {}
        
        for t in tokens:
            # 0. Check Token Cache
            if t in self._token_cache:
                start_weights = self._token_cache[t]
                # Merge cached weights
                for k, v in start_weights.items():
                    weights[k] = max(weights.get(k, 0), v)
                continue
                
            # If not in cache, compute expansion
            t_weights = {t: 1.0}
            
            # 1. Stemming Rules (Dampened)
            if len(t) > 4:
                stem = None
                if t.endswith('ing'): stem = t[:-3]
                elif t.endswith('ed') or t.endswith('es'): stem = t[:-2]
                elif t.endswith('s') and not t.endswith('ss'): stem = t[:-1]
                
                if stem and len(stem) > 2:
                    t_weights[stem] = 0.8

            # 2. Thesaurus Expansion
            if t in self.thesaurus:
                for syn, weight in self.thesaurus[t].items():
                    t_weights[syn] = max(t_weights.get(syn, 0), weight)
            
            # Cache the result for this token
            self._token_cache[t] = t_weights
            
            # Merge into main weights
            for k, v in t_weights.items():
                weights[k] = max(weights.get(k, 0), v)
        
        return weights

    def add_skill(self, trigger: str, text: str) -> None:
        """
        Registers a new skill in the engine.
        
        Args:
            trigger: The primary activation command (e.g., '/run-task').
            text: A descriptive block of text defining the skill's purpose.
        """
        self.skills[trigger] = text
        self.vocab.update(self.tokenize(text))

    def add_skill_incremental(self, trigger: str, text: str) -> None:
        """[ALFRED] Register a skill and update the index without a full rebuild."""
        self.add_skill(trigger, text)
        # Rebuild IDF only for the new doc tokens
        num_docs = len(self.skills)
        if num_docs == 0:
            return
        tokens_set = set(self.tokenize(text))
        for word in tokens_set:
            # Recalculate IDF with updated doc count
            old_count = sum(1 for t in self.skills.values() if word in set(self.tokenize(t)))
            self.idf[word] = math.log(num_docs / (1 + old_count)) + 1
        # Refresh sorted vocab cache and vectorize the new skill
        self.sorted_vocab = sorted(list(self.vocab))
        counts = {t: self.tokenize(text).count(t) for t in tokens_set}
        self.vectors[trigger] = self._vectorize(counts)
        # Invalidate search and expansion caches
        self._search_cache.clear()
        self._expansion_cache.clear()

    def build_index(self) -> None:
        """[ALFRED] Build TF-IDF index with cached sorted vocabulary for rapid search."""
        num_docs = len(self.skills)
        if num_docs == 0: return
        
        # [ALFRED] Cache sorted vocab to avoid redundant sorts in search loop
        self.sorted_vocab = sorted(list(self.vocab))
        
        doc_counts = {}
        for text in self.skills.values():
            words = set(self.tokenize(text))
            for word in words:
                doc_counts[word] = doc_counts.get(word, 0) + 1
                if word not in self.vocab: self.vocab.add(word) # Dynamic update
        
        # Calculate IDF
        for word, count in doc_counts.items():
            self.idf[word] = math.log(num_docs / (1 + count)) + 1
            
        for trigger, text in self.skills.items():
            # Build initial vector from doc tokens (Use Term Frequency)
            tokens = self.tokenize(text)
            counts = {t: tokens.count(t) for t in set(tokens)}
            self.vectors[trigger] = self._vectorize(counts)

    def _vectorize(self, token_weights: dict[str, float]) -> list[float]:
        """
        Converts a dictionary of token weights into a normalized TF-IDF vector.
        
        Args:
            token_weights: A dictionary mapping tokens to their relative weights.
            
        Returns:
            A normalized list of floats representing the query in the engine's vector space.
        """
        # token_weights is a dict of {token: weight}
        total_weight = sum(token_weights.values()) or 1
        
        # [ALFRED] Use cached vocabulary and list comprehension for speed optimization
        vocab = getattr(self, 'sorted_vocab', sorted(list(self.vocab)))
        
        return [
            (token_weights.get(word, 0) / total_weight) * self.idf.get(word, 0)
            for word in vocab
        ]

    def similarity(self, v1: list[float], v2: list[float]) -> float:
        return self._similarity_strategy.compute(v1, v2)

    def set_similarity_strategy(self, strategy: SimilarityStrategy) -> None:
        """[ALFRED] Swap the similarity function at runtime. Clears search cache."""
        self._similarity_strategy = strategy
        self._search_cache.clear()

    def search(self, query: str) -> list[dict]:
        # 0. Check Search Cache
        query_norm = query.lower().strip()
        if query_norm in self._search_cache:
            return self._search_cache[query_norm]

        # 1. Check direct phrase mappings (Corrections)
        if query_norm in self.corrections.get("phrase_mappings", {}):
            trigger = self.corrections["phrase_mappings"][query_norm]
            is_global = trigger.startswith("GLOBAL:") if trigger else False
            res = [{"trigger": trigger, "score": 1.1, "note": "Correction mapped", "is_global": is_global}]
            self._search_cache[query_norm] = res
            return res

        # 2. Vector search (Cached Expansion)
        weighted_tokens = {}
        # [ALFRED] Expansion Caching: Check if we've already expanded this specific query's tokens
        # Note: We cache the *result* of expansion for the whole query string for simplicity and hit-rate
        if query_norm in self._expansion_cache:
            weighted_tokens = self._expansion_cache[query_norm]
        else:
            weighted_tokens = self.expand_query(query)
            self._expansion_cache[query_norm] = weighted_tokens

        q_vec = self._vectorize(weighted_tokens)
        
        # 3. Direct Trigger Boost (Dampened)
        trigger_boosts = {}
        tokens = self.tokenize(query)
        common_verbs = {
            'make', 'check', 'look', 'wrap', 'run', 'build', 'create', 'do',
            'construct', 'implement', 'develop', 'generate', 'analyze', 'audit', 'debug', 'validate',
            'verify', 'plan', 'design', 'test', 'deploy', 'launch', 'push', 'release', 'ship',
            'setup', 'bootstrap', 'now', 'today', 'what', 'please', 'just', 'more',
            'ui', 'ux', 'visual', 'visuals', 'interface', 'status'
        }
        # [ALFRED] High-priority verbs that should NOT be dampened if they match a specific trigger
        priority_verbs = {'begin', 'start', 'resume', 'initiate'}
        
        for t in tokens:
            if t in self.trigger_map:
                # [ALFRED] Maximum precision boost for high-accuracy intent resolution
                # Differentiate between generic "run" and specific "begin"
                if t in priority_verbs:
                    boost_val = 2.0 # Mega-boost for start/resume signals
                elif t in common_verbs:
                    boost_val = 0.8 
                else:
                    boost_val = 0.98
                    
                for skill in self.trigger_map[t]:
                    trigger_boosts[skill] = max(trigger_boosts.get(skill, 0), boost_val)


        results = []
        # [ALFRED] Optimization: Pre-calculate vector magnitudes if possible, but for now just inline the similarity
        # or use the existing method which is clean enough. 
        # For valid results, we only care about non-zero similarities usually
        
        for trigger, s_vec in self.vectors.items():
            # Optimization: Skip if dot product will be 0 (no shared tokens) 
            # This requires sparse representation which we don't strictly have in list form, 
            # but we can rely on modern CPU caching for the list walk.
            
            score = self.similarity(q_vec, s_vec)
            
            # Apply dampened boost
            if trigger in trigger_boosts:
                # If we have a massive boost (2.0), we force it to top
                boost = trigger_boosts[trigger]
                if boost >= 2.0:
                   score = 1.0 + (boost - 1.0) # pushes above 1.0
                else:
                   score = score + boost * (1.0 - score)
            
            is_global = trigger.startswith("GLOBAL:")
            # [ALFRED] Sovereign Priority: Slight tie-breaker for core intents
            if (trigger.startswith("/") or trigger == "SovereignFish") and not is_global:
                score *= 1.1
            
            # [ALFRED] Specific Demotion: If "begin" or "new" is present, /run-task shouldn't steal from /lets-go
            # logic: /run-task is "create", /lets-go is "begin"
            if "/lets-go" in trigger_boosts and trigger == "/run-task":
                score *= 0.5 

            # [ALFRED] Global vs Generic Arbitration
            # If a Specific GLOBAL skill matches well, it should beat generic /run-task
            # But /investigate should beat generic GLOBAL tools unless highly specific
            if trigger == "/run-task" and any(k.startswith("GLOBAL:") for k in trigger_boosts if trigger_boosts[k] > 1.0):
                 score *= 0.8

            results.append({"trigger": trigger, "score": score, "is_global": is_global})
        
        final_results = sorted(results, key=lambda x: x['score'], reverse=True)
        # Apply Confidence Floor (The 85% Bar - Dampened for Vector Search)
        # [ALFRED] Ensure we don't return low-confidence noise.
        confident_results = []
        for r in final_results:
            if r['score'] >= 0.25 or r.get('note') == 'Correction mapped':
                # [ALFRED] Sink noise to None
                if r['trigger'] == 'GLOBAL:noise':
                    r['trigger'] = None
                confident_results.append(r)
        
        self._search_cache[query_norm] = confident_results
        return confident_results


    def load_core_skills(self):
        core = {
            "/lets-go": "begin initiate start resume lets-go priority boot progress",
            "/run-task": "create build generate implement develop construct new feature page component",
            "/investigate": "debug analyze audit sentinel validate explore bug error issue auth login credentials log",
            "/plan": "architect blueprint itinerary map outline plan strategy roadmap system architecture",
            "/test": "check integrity performance test validate verification verify coverage unit integration",
            "/wrap-it-up": "finish complete finalize quit exit done stop end session wrap close",
            "SovereignFish": "polish improve refine aesthetics style design beautify visual ui ux"
        }
        context = {
            "/lets-go": "task work project logic flow next setup environment",
            "/run-task": "feature page component task logic",
            "/investigate": "bug error log issue login confirm",
            "/plan": "architecture module feature system implementation",
            "/test": "unit coverage integration performance quality",
            "/wrap-it-up": "session day close work",
            "SovereignFish": "visual structural ui ux design"
        }

        # [ALFRED] Populate trigger_map FIRST so tokenize can protect triggers
        for trigger in core:
            for w in core[trigger].split():
                clean = w.lower().strip()
                if clean not in self.trigger_map: self.trigger_map[clean] = []
                self.trigger_map[clean].append(trigger)
            
            # [ALFRED] Hardened Trigger: Index the trigger itself for 1:1 matching
            if trigger not in self.trigger_map: self.trigger_map[trigger] = [trigger]
            elif trigger not in self.trigger_map[trigger]: self.trigger_map[trigger].append(trigger)

        for trigger in core:
            words = core[trigger] + " " + context[trigger]
            self.add_skill(trigger, (words + " ") * 3)

    def load_skills_from_dir(self, directory, prefix=""):
        """[ALFRED] Batch load skills with high-value signal extraction."""
        if not os.path.exists(directory): return
        for folder in os.listdir(directory):
            path = os.path.join(directory, folder)
            if not os.path.isdir(path): continue
            
            # [ALFRED] Hybrid Discovery: Support SKILL.qmd (Primary) or SKILL.md (Fallback)
            qmd_path = os.path.join(path, "SKILL.qmd")
            md_path = os.path.join(path, "SKILL.md")
            if os.path.exists(qmd_path):
                self._load_single_skill(folder, qmd_path, prefix)
            elif os.path.exists(md_path):
                self._load_single_skill(folder, md_path, prefix)

    def _load_single_skill(self, folder, md_path, prefix):
        """Extract metadata and activation signals from a single SKILL.md."""
        trigger = f"{prefix}{folder}"
        with open(md_path, 'r', encoding='utf-8') as f: lines = f.readlines()
        
        signal, in_fm, expect_keywords = [], False, False
        for line in lines:
            line = line.strip()
            if not line: continue
            if line == "---": in_fm = not in_fm; continue
            if in_fm:
                if line.startswith(("name:", "description:")): signal.append(line.split(":", 1)[1].strip())
            elif "Activation Words" in line or "Keywords" in line:
                if ":" in line:
                    words = line.split(":", 1)[1].strip()
                    self._populate_trigger_map(trigger, words)
                    signal.append(words)
                else:
                    expect_keywords = True
            elif expect_keywords:
                self._populate_trigger_map(trigger, line)
                signal.append(line)
                expect_keywords = False
        
        self.add_skill(trigger, f"{folder} {' '.join(signal)}")

    def _populate_trigger_map(self, trigger, words_str):
        """Helper to safely populate trigger map with word list."""
        words = words_str.replace(',', ' ').lower().split()
        for w in words:
            if not w: continue
            if w not in self.trigger_map: self.trigger_map[w] = []
            if trigger not in self.trigger_map[w]:
                self.trigger_map[w].append(trigger)

    def score_identity(self, text: str, persona_name: str) -> float:
        """
        Calculates a 'Purity Score' (0-1) by comparing input text 
        to the vector space of the chosen persona's dialogue.
        """
        # 1. Expand query for text
        weighted_tokens = self.expand_query(text)
        text_vec = self._vectorize(weighted_tokens)
        
        # 2. Re-index temporarily on dialogue
        # We need a mini-engine for this or just simulate similarity
        # Let's use the current engine's vocab but check against dialogue data
        # If the text has tokens that appear frequently in the persona's DB, it's a match.
        
        # Actually, if we have HUD.DIALOGUE loaded, we can compare directly.
        # Simple heuristic for now: token overlap with dialogue registry
        tokens = set(self.tokenize(text))
        persona_tokens = set()
        
        # Defensive check for HUD.DIALOGUE
        if HUD.DIALOGUE:
            for phrases in HUD.DIALOGUE.intents.values():
                for p in phrases:
                    persona_tokens.update(self.tokenize(p))
        
        if not persona_tokens or not tokens: return 0.0
        
        match = len(tokens.intersection(persona_tokens)) / len(tokens)
        return match
