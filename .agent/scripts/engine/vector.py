import math
import json
import re
import sys
import os

# Import Shared UI from parent directory
try:
    from ui import HUD
except ImportError:
    # Fallback if run from engine/ directory locally
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from ui import HUD

class SovereignVector:
    def __init__(self, thesaurus_path=None, corrections_path=None, stopwords_path=None):
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
        self._expansion_cache = {} # {token: expanded_weighted_tokens}

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
        if not path or not os.path.exists(path) or os.path.getsize(path) > 2*10**6: return {}
        try:
            with open(path, 'r', encoding='utf-8') as f: content = f.read()
            mapping = {}
            for word, syns in re.findall(r'- (?:\*\*)?(\w+)(?:\*\*)?: ([\w,: \.]+)', content):
                syn_dict = {}
                for s in syns.split(','):
                    s = s.strip().lower()
                    if not s: continue
                    name, weight = (s.split(':') + ["1.0"])[:2]
                    try: weight = max(0.1, min(2.0, float(weight)))
                    except: weight = 1.0
                    syn_dict[name.strip()] = weight
                mapping[word.lower()] = syn_dict
            self._apply_thesaurus_corrections(mapping)
            return mapping
        except: return {}

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
        """[ALFRED] Optimized Unicode-aware tokenizer with stopword filtration."""
        if not text: return []
        # [ALFRED] Use \w+ for Unicode support including CJK characters
        tokens = re.findall(r'[\w\d]+', text.lower())
        return [t for t in tokens if t not in self.stopwords] or tokens

    def expand_query(self, query: str) -> dict[str, float]:
        """[ALFRED] Neural Query Expansion with stemming and thesaurus signals."""
        tokens = self.tokenize(query)
        weights = {t: 1.0 for t in tokens}
        
        # [ALFRED] Unified expansion pass
        for t in list(weights.keys()):
            # 1. Stemming Rules (Dampened)
            if len(t) > 4:
                stem = None
                if t.endswith('ing'): stem = t[:-3]
                elif t.endswith('ed') or t.endswith('es'): stem = t[:-2]
                elif t.endswith('s') and not t.endswith('ss'): stem = t[:-1]
                
                if stem and len(stem) > 2:
                    weights[stem] = max(weights.get(stem, 0), 0.8)

            # 2. Thesaurus Expansion
            if t in self.thesaurus:
                for syn, weight in self.thesaurus[t].items():
                    weights[syn] = max(weights.get(syn, 0), weight)
        
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

    def build_index(self) -> None:
        """[ALFRED] Build TF-IDF index with cached sorted vocabulary for rapid search."""
        num_docs = len(self.skills)
        if num_docs == 0: return
        
        # [ALFRED] Cache sorted vocab to avoid redundant sorts in search loop
        self.sorted_vocab = sorted(list(self.vocab))
        
        doc_counts = {word: 0 for word in self.vocab}
        for text in self.skills.values():
            words = set(self.tokenize(text))
            for word in words:
                doc_counts[word] += 1
        
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
        dot = sum(a*b for a, b in zip(v1, v2))
        mag1 = math.sqrt(sum(a*a for a in v1))
        mag2 = math.sqrt(sum(b*b for b in v2))
        if mag1 == 0 or mag2 == 0: return 0
        return dot / (mag1 * mag2)

    def search(self, query: str) -> list[dict]:
        # 0. Check Search Cache
        query_norm = query.lower().strip()
        if query_norm in self._search_cache:
            return self._search_cache[query_norm]

        # 1. Check direct phrase mappings (Corrections)
        if query_norm in self.corrections.get("phrase_mappings", {}):
            trigger = self.corrections["phrase_mappings"][query_norm]
            is_global = trigger.startswith("GLOBAL:")
            res = [{"trigger": trigger, "score": 1.1, "note": "Correction mapped", "is_global": is_global}]
            self._search_cache[query_norm] = res
            return res

        # 2. Vector search
        weighted_tokens = self.expand_query(query)
        q_vec = self._vectorize(weighted_tokens)
        
        # 3. Direct Trigger Boost
        trigger_boosts = {}
        tokens = self.tokenize(query)
        for t in tokens:
            if t in self.trigger_map:
                for skill in self.trigger_map[t]:
                    trigger_boosts[skill] = 1.0 # Force max confidence for explicit triggers

        results = []
        for trigger, s_vec in self.vectors.items():
            score = self.similarity(q_vec, s_vec)
            # Apply boost
            if trigger in trigger_boosts:
                score = max(score, trigger_boosts[trigger])
            
            is_global = trigger.startswith("GLOBAL:")
            results.append({"trigger": trigger, "score": score, "is_global": is_global})
        
        final_results = sorted(results, key=lambda x: x['score'], reverse=True)
        self._search_cache[query_norm] = final_results
        return final_results

    def load_core_skills(self):
        core = {
            "/lets-go": "start resume begin progress initiate priority",
            "/run-task": "create build generate implement develop make new",
            "/investigate": "debug analyze investigate audit verify check find fix scanner sentinel validate explore",
            "/wrap-it-up": "finish complete finalize quit exit done stop end wrap",
            "SovereignFish": "polish improve refine aesthetics visuals style clean"
        }
        context = {
            "/lets-go": "task work project logic flow next",
            "/run-task": "feature page component task logic",
            "/investigate": "bug error log issue login confirm test",
            "/wrap-it-up": "session day close work",
            "SovereignFish": "visual structural ui ux design"
        }
        for trigger in core:
            words = core[trigger] + " " + context[trigger]
            self.add_skill(trigger, (words + " ") * 3)
            for w in core[trigger].split():
                if w not in self.trigger_map: self.trigger_map[w] = []
                self.trigger_map[w].append(trigger)

    def load_skills_from_dir(self, directory, prefix=""):
        """[ALFRED] Batch load skills with high-value signal extraction."""
        if not os.path.exists(directory): return
        for folder in os.listdir(directory):
            path = os.path.join(directory, folder)
            if not os.path.isdir(path): continue
            
            md_path = os.path.join(path, "SKILL.md")
            if os.path.exists(md_path):
                self._load_single_skill(folder, md_path, prefix)

    def _load_single_skill(self, folder, md_path, prefix):
        """Extract metadata and activation signals from a single SKILL.md."""
        trigger = f"{prefix}{folder}"
        with open(md_path, 'r', encoding='utf-8') as f: lines = f.readlines()
        
        signal, in_fm = [], False
        for line in lines:
            if line.strip() == "---": in_fm = not in_fm; continue
            if in_fm:
                if line.startswith(("name:", "description:")): signal.append(line.split(":", 1)[1].strip())
            elif "Activation Words:" in line:
                words = line.split(":", 1)[1].strip().replace(',', ' ')
                for w in words.split():
                    clean = w.lower().strip()
                    if clean and clean not in self.stopwords:
                        if clean not in self.trigger_map: self.trigger_map[clean] = []
                        self.trigger_map[clean].append(trigger)
                signal.append(words)
        
        self.add_skill(trigger, f"{folder} {' '.join(signal)}")

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
