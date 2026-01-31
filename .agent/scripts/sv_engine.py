import math
import json
import re
import sys
import os

class SovereignVector:
    def __init__(self, thesaurus_path=None, corrections_path=None):
        self.thesaurus = self._load_thesaurus(thesaurus_path) if thesaurus_path else {}
        self.corrections = self._load_json(corrections_path) if corrections_path else {"phrase_mappings": {}, "synonym_updates": {}}
        self.skills = {} # {trigger: "full text of skill description"}
        self.vocab = set()
        self.idf = {}
        self.vectors = {} # {trigger: [vector]}

    def _load_json(self, path):
        if not path or not os.path.exists(path): return {}
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return {}

    def _load_thesaurus(self, path):
        if not path or not os.path.exists(path): return {}
        try:
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            mapping = {}
            items = re.findall(r'- (?:\*\*)?(\w+)(?:\*\*)?: ([\w, ]+)', content)
            for word, syns in items:
                syn_list = [s.strip().lower() for s in syns.split(',')]
                mapping[word.lower()] = syn_list
            
            # Apply corrections to thesaurus
            if hasattr(self, 'corrections'):
                for word, syns in self.corrections.get("synonym_updates", {}).items():
                    mapping[word] = list(set(mapping.get(word, []) + syns))
            
            return mapping
        except Exception as e:
            return {}

    def tokenize(self, text):
        if not text: return []
        return re.findall(r'\w+', text.lower())

    def expand_query(self, query):
        tokens = self.tokenize(query)
        expanded = list(tokens)
        for token in tokens:
            if token in self.thesaurus:
                expanded.extend(self.thesaurus[token])
            if token.endswith('s'):
                expanded.append(token[:-1])
        return expanded

    def add_skill(self, trigger, text):
        self.skills[trigger] = text
        self.vocab.update(self.tokenize(text))

    def build_index(self):
        num_docs = len(self.skills)
        if num_docs == 0: return
        doc_counts = {word: 0 for word in self.vocab}
        for text in self.skills.values():
            words = set(self.tokenize(text))
            for word in words:
                doc_counts[word] += 1
        for word, count in doc_counts.items():
            self.idf[word] = math.log(num_docs / (1 + count)) + 1
        for trigger, text in self.skills.items():
            self.vectors[trigger] = self._vectorize(self.tokenize(text))

    def _vectorize(self, tokens):
        counts = {}
        for t in tokens: 
            if t in self.vocab: counts[t] = counts.get(t, 0) + 1
        vector = []
        for word in sorted(self.vocab):
            tf = counts.get(word, 0) / (len(tokens) or 1)
            vector.append(tf * self.idf.get(word, 0))
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
            return [{"trigger": trigger, "score": 1.1, "note": "Correction mapped"}]

        # 2. Vector search
        expanded = self.expand_query(query)
        q_vec = self._vectorize(expanded)
        results = []
        for trigger, s_vec in self.vectors.items():
            score = self.similarity(q_vec, s_vec)
            results.append({"trigger": trigger, "score": score})
        return sorted(results, key=lambda x: x['score'], reverse=True)

    def load_skills_from_dir(self, directory):
        if not os.path.exists(directory): return
        for skill_folder in os.listdir(directory):
            folder_path = os.path.join(directory, skill_folder)
            if os.path.isdir(folder_path):
                skill_md = os.path.join(folder_path, "SKILL.md")
                if os.path.exists(skill_md):
                    with open(skill_md, 'r', encoding='utf-8') as f:
                        content = f.read()
                    # Activation words are used as the trigger text
                    activation = re.search(r'Activation Words: (.*)', content)
                    trigger = skill_folder
                    skill_text = content
                    if activation:
                        skill_text += " " + activation.group(1).replace(',', ' ')
                    self.add_skill(trigger, skill_text)

if __name__ == "__main__":
    base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    project_root = os.path.dirname(base_path)
    
    engine = SovereignVector(
        thesaurus_path=os.path.join(project_root, "thesaurus.md"), 
        corrections_path=os.path.join(base_path, "corrections.json")
    )
    
    # 1. Load Core Workflow Skills (Simulated trigger text)
    engine.add_skill("/lets-go", "start resume begin progress next priority task work")
    engine.add_skill("/run-task", "create make new build generate implement feature task")
    engine.add_skill("/investigate", "debug check find analyze investigate verify test audit bug")
    engine.add_skill("/wrap-it-up", "finish done wrap complete finalize session quit exit")
    engine.add_skill("SovereignFish", "polish improve clean refine polish aesthetics visual structural")
    
    # 2. Dynamic Skills
    engine.load_skills_from_dir(os.path.join(base_path, "skills"))
    
    engine.build_index()

    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])
        results = engine.search(query)
        trace = {
            "query": query,
            "expanded": engine.expand_query(query),
            "top_match": results[0] if results else None,
            "all_results": results[:3]
        }
        print(json.dumps(trace, indent=2))
