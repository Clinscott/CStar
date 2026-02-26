import json
import math
import os
import re
import sys

# Import Shared UI from parent directory
try:
    from src.core.sovereign_hud import SovereignHUD
except ImportError:
    # Fallback if run from engine/ directory locally
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from src.core.sovereign_hud import SovereignHUD

class SovereignVector:
    def __init__(self, thesaurus_path=None, corrections_path=None, stopwords_path=None):
        self.thesaurus = self._load_thesaurus(thesaurus_path) if thesaurus_path else {}
        self.corrections = self._load_json(corrections_path) if corrections_path else {"phrase_mappings": {}, "synonym_updates": {}}
        self.stopwords = self._load_stopwords(stopwords_path)

        # SovereignFish: Boot Log
        SovereignHUD.box_top("ENGINE INITIALIZED")
        SovereignHUD.box_row("STATUS", "ONLINE", SovereignHUD.GREEN)
        SovereignHUD.box_bottom()

        self.skills = {} # {trigger: "full text of skill description"}
        self.trigger_map = {} # {keyword: [triggers]}
        self.vocab = set()
        self.idf = {}
        self.vectors = {} # {trigger: [vector]}

    def _load_json(self, path):
        if not path or not os.path.exists(path): return {}
        try:
            with open(path, encoding='utf-8') as f:
                return json.load(f)
        except:
            return {}

    def _load_stopwords(self, path):
        defaults = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
            'is', 'are', 'was', 'were', 'be', 'been', 'it', 'this', 'that', 'these', 'those',
            'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
            'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
            'some', 'any', 'no', 'not', 'do', 'does', 'did', 'done', 'will', 'would', 'shall', 'should',
            'can', 'could', 'may', 'might', 'must', 'have', 'has', 'had', 'go', 'get', 'make'
        }
        if not path or not os.path.exists(path): return defaults
        try:
            with open(path, encoding='utf-8') as f:
                loaded = set(json.load(f))
                return loaded if loaded else defaults
        except:
            return defaults

    def _load_thesaurus(self, path):
        if not path or not os.path.exists(path): return {}
        try:
            with open(path, encoding='utf-8') as f:
                content = f.read()

            mapping = {}
            # Match word: syn1, syn2:weight, syn3
            items = re.findall(r'- (?:\*\*)?(\w+)(?:\*\*)?: ([\w,: \.]+)', content)
            for word, syns in items:
                syn_dict = {}
                for s in syns.split(','):
                    s = s.strip().lower()
                    if ':' in s:
                        name, weight = s.split(':', 1)
                        try:
                            syn_dict[name.strip()] = float(weight.strip())
                        except:
                            syn_dict[name.strip()] = 1.0
                    else:
                        syn_dict[s] = 1.0
                mapping[word.lower()] = syn_dict

            # Apply corrections to thesaurus
            if hasattr(self, 'corrections'):
                for word, syns in self.corrections.get("synonym_updates", {}).items():
                    word_map = mapping.get(word, {})
                    for s in syns:
                        word_map[s] = 1.0
                    mapping[word] = word_map

            return mapping
        except Exception:
            return {}

    def tokenize(self, text):
        if not text: return []
        tokens = re.findall(r'\w+', text.lower())
        filtered = [t for t in tokens if t not in self.stopwords]
        return filtered if filtered else tokens

    def expand_query(self, query):
        tokens = self.tokenize(query)
        # Use a dict for weights: token -> max_weight
        weights = dict.fromkeys(tokens, 1.0)

        # Stemming (SovereignFish improvement)
        for t in list(weights.keys()):
            if len(t) > 4:
                if t.endswith('ing'): weights[t[:-3]] = 0.8
                elif t.endswith('ed') or t.endswith('es'): weights[t[:-2]] = 0.8
                elif t.endswith('s') and not t.endswith('ss'): weights[t[:-1]] = 0.8

        # Thesaurus Expansion
        for token in tokens:
            if token in self.thesaurus:
                for syn, weight in self.thesaurus[token].items():
                    weights[syn] = max(weights.get(syn, 0), weight)

        return weights

    def add_skill(self, trigger, text):
        self.skills[trigger] = text
        self.vocab.update(self.tokenize(text))

    def build_index(self):
        num_docs = len(self.skills)
        if num_docs == 0: return
        doc_counts = dict.fromkeys(self.vocab, 0)
        for text in self.skills.values():
            words = set(self.tokenize(text))
            for word in words:
                doc_counts[word] += 1
        for word, count in doc_counts.items():
            self.idf[word] = math.log(num_docs / (1 + count)) + 1
        for trigger, text in self.skills.items():
            # Build initial vector from doc tokens (Use Term Frequency)
            tokens = self.tokenize(text)
            counts = {}
            for t in tokens:
                counts[t] = counts.get(t, 0) + 1.0
            self.vectors[trigger] = self._vectorize(counts)

    def _vectorize(self, token_weights):
        # token_weights is a dict of {token: weight}
        counts = {}
        for t, weight in token_weights.items():
            if t in self.vocab:
                counts[t] = counts.get(t, 0) + weight

        vector = []
        total_weight = sum(token_weights.values()) or 1
        for word in sorted(self.vocab):
            score = counts.get(word, 0) / total_weight
            vector.append(score * self.idf.get(word, 0))
        return vector

    def similarity(self, v1, v2):
        dot = sum(a*b for a, b in zip(v1, v2))
        mag1 = math.sqrt(sum(a*a for a in v1))
        mag2 = math.sqrt(sum(b*b for b in v2))
        if mag1 == 0 or mag2 == 0: return 0
        return dot / (mag1 * mag2)

    def search(self, query):
        # 1. Check direct phrase mappings (Corrections)
        query_norm = query.lower().strip()
        if query_norm in self.corrections.get("phrase_mappings", {}):
            trigger = self.corrections["phrase_mappings"][query_norm]
            is_global = trigger.startswith("GLOBAL:")
            return [{"trigger": trigger, "score": 1.1, "note": "Correction mapped", "is_global": is_global}]

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
        return sorted(results, key=lambda x: x['score'], reverse=True)

    def load_core_skills(self):
        self.add_skill("/lets-go", ("start resume begin progress next priority task work project logic flow " * 3) + "resume creating the store")
        self.add_skill("/run-task", ("create make new build generate implement feature task page component logic " * 3) + "make a new shoe page")
        self.add_skill("/investigate", ("debug fix check find analyze investigate verify test audit bug error log issue login " * 3) + "check the login bug")
        self.add_skill("/wrap-it-up", ("finish done wrap complete finalize session quit exit day close stop end work " * 3) + "wrap it up for the day")
        self.add_skill("SovereignFish", ("polish improve clean refine polish aesthetics visual structural style ui ux design " * 3) + "refine the visuals")

    def load_skills_from_dir(self, directory, prefix=""):
        if not os.path.exists(directory): return
        for skill_folder in os.listdir(directory):
            folder_path = os.path.join(directory, skill_folder)
            if os.path.isdir(folder_path):
                trigger = f"{prefix}{skill_folder}" # Defined early for mapping
                skill_md = os.path.join(folder_path, "SKILL.md")
                if os.path.exists(skill_md):
                    with open(skill_md, encoding='utf-8') as f:
                        lines = f.readlines()

                    # Extract High-Value Signal ONLY
                    signal_tokens = []

                    # 1. Parse YAML Frontmatter (naive)
                    in_frontmatter = False
                    for line in lines:
                        if line.strip() == "---":
                            in_frontmatter = not in_frontmatter
                            continue
                        if in_frontmatter:
                            if line.startswith("name:"): signal_tokens.append(line.split(":", 1)[1].strip())
                            if line.startswith("description:"): signal_tokens.append(line.split(":", 1)[1].strip())

                        # 2. Activation Words (Priority - Direct Mapping)
                        if "Activation Words:" in line:
                            words = line.split(":", 1)[1].strip().replace(',', ' ')
                            for w in words.split():
                                clean_w = w.lower().strip()
                                if clean_w not in self.stopwords:
                                    if clean_w not in self.trigger_map: self.trigger_map[clean_w] = []
                                    self.trigger_map[clean_w].append(trigger)

                            signal_tokens.append(words)

                    # 3. Add folder name as explicit token
                    signal_tokens.append(skill_folder)

                    skill_text = " ".join(signal_tokens)
                    self.add_skill(trigger, skill_text)

    def score_identity(self, text, persona_name):
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

        # Actually, if we have SovereignHUD.DIALOGUE loaded, we can compare directly.
        # Simple heuristic for now: token overlap with dialogue registry
        tokens = set(self.tokenize(text))
        persona_tokens = set()

        # Defensive check for SovereignHUD.DIALOGUE
        if SovereignHUD.DIALOGUE:
            for phrases in SovereignHUD.DIALOGUE.intents.values():
                for p in phrases:
                    persona_tokens.update(self.tokenize(p))

        if not persona_tokens or not tokens: return 0.0

        match = len(tokens.intersection(persona_tokens)) / len(tokens)
        return match
