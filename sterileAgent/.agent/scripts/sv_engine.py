import math
import json
import re
import sys
import os


class SovereignHUD:
    CYAN = "\033[36m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    MAGENTA = "\033[35m"
    RED = "\033[31m"
    RESET = "\033[0m"
    BOLD = "\033[1m"
    
    @staticmethod
    def box_top(title=""):
        width = 60
        t_len = len(title)
        padding = (width - t_len - 4) // 2
        print(f"{SovereignHUD.CYAN}┌{'─'*padding} {SovereignHUD.BOLD}{title}{SovereignHUD.RESET}{SovereignHUD.CYAN} {'─'*padding}┐{SovereignHUD.RESET}")

    @staticmethod
    def box_row(label, value, color=CYAN):
        print(f"{SovereignHUD.CYAN}│{SovereignHUD.RESET} {label:<20} {color}{value}{SovereignHUD.RESET}")

    @staticmethod
    def box_separator():
        print(f"{SovereignHUD.CYAN}├{'─'*58}┤{SovereignHUD.RESET}")

    @staticmethod
    def box_bottom():
        print(f"{SovereignHUD.CYAN}└{'─'*58}┘{SovereignHUD.RESET}")
    
    @staticmethod
    def progress_bar(val: float):
        # [||||||....]
        blocks = int(val * 10)
        bar = "█" * blocks + "░" * (10 - blocks)
        return bar

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
            return [{"trigger": trigger, "score": 1.1, "note": "Correction mapped", "is_global": False}]

        # 2. Vector search
        expanded = self.expand_query(query)
        q_vec = self._vectorize(expanded)
        results = []
        for trigger, s_vec in self.vectors.items():
            score = self.similarity(q_vec, s_vec)
            is_global = trigger.startswith("GLOBAL:")
            results.append({"trigger": trigger, "score": score, "is_global": is_global})
        return sorted(results, key=lambda x: x['score'], reverse=True)

    def load_skills_from_dir(self, directory, prefix=""):
        if not os.path.exists(directory): return
        for skill_folder in os.listdir(directory):
            folder_path = os.path.join(directory, skill_folder)
            if os.path.isdir(folder_path):
                skill_md = os.path.join(folder_path, "SKILL.md")
                if os.path.exists(skill_md):
                    with open(skill_md, 'r', encoding='utf-8') as f:
                        content = f.read()
                    activation = re.search(r'Activation Words: (.*)', content)
                    trigger = f"{prefix}{skill_folder}"
                    skill_text = content
                    if activation:
                        skill_text += " " + activation.group(1).replace(',', ' ')
                    self.add_skill(trigger, skill_text)

if __name__ == "__main__":
    base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    project_root = os.path.dirname(base_path)
    
    # Load Config
    config = {}
    config_path = os.path.join(base_path, "config.json")
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
        except: pass

    engine = SovereignVector(
        thesaurus_path=os.path.join(project_root, "thesaurus.md"), 
        corrections_path=os.path.join(base_path, "corrections.json")
    )
    
    # 1. Load Core & Local Skills
    engine.add_skill("/lets-go", "start resume begin progress next priority task work")
    engine.add_skill("/run-task", "create make new build generate implement feature task")
    engine.add_skill("/investigate", "debug check find analyze investigate verify test audit bug")
    engine.add_skill("/wrap-it-up", "finish done wrap complete finalize session quit exit")
    engine.add_skill("SovereignFish", "polish improve clean refine polish aesthetics visual structural")
    engine.load_skills_from_dir(os.path.join(base_path, "skills"))
    
    # Load Global Skills (Registry)
    framework_root = config.get("FrameworkRoot")
    if framework_root:
        global_path = os.path.join(framework_root, "skills_db")
        if os.path.exists(global_path):
            engine.load_skills_from_dir(global_path, prefix="GLOBAL:")
    
    engine.build_index()

    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])
        results = engine.search(query)
        
        # Tiered Output Integration
        top_match = results[0] if results else None
        recommendations = [r for r in results if r['is_global'] and r['score'] > 0.5]
        
        propose_install = None
        if top_match and top_match['is_global'] and top_match['score'] > 0.9:
            skill_name = top_match['trigger'].replace("GLOBAL:", "")
            propose_install = f"powershell -Command \"& {{ python .agent/scripts/install_skill.py {skill_name} }}\""

        trace = {
            "query": query,
            "top_match": top_match,
            "propose_immediate_install": propose_install,
            "recommendation_report": recommendations if not propose_install else []
        }
        
        if "--json-only" in sys.argv:
            print(json.dumps(trace, indent=2))
            sys.exit(0)

        # --- SCI-FI TERMINAL UI (SovereignFish Improvement) ---
        SovereignHUD.box_top("C* NEURAL TRACE")
        SovereignHUD.box_row("Intent", query, SovereignHUD.BOLD)
        
        if top_match:
            score = top_match['score']
            score_color = SovereignHUD.GREEN if score > 0.8 else SovereignHUD.YELLOW
            is_global = f"{SovereignHUD.MAGENTA}[GLOBAL]{SovereignHUD.RESET} " if top_match['is_global'] else ""
            
            bar = SovereignHUD.progress_bar(score)
            SovereignHUD.box_row("Match", f"{is_global}{top_match['trigger']}")
            SovereignHUD.box_row("Confidence", f"{bar} {score:.2f}", score_color)
        
        if propose_install:
            SovereignHUD.box_separator()
            SovereignHUD.box_row("⚠️  PROACTIVE", "Handshake Detected", SovereignHUD.YELLOW)
            SovereignHUD.box_row("Action", f"Install {skill_name}", SovereignHUD.GREEN)
            
            # Interactive Handshake
            SovereignHUD.box_bottom()
            try:
                # Flush stdout to ensure SovereignHUD is visible
                sys.stdout.flush()
                # Use raw input if possible, but keep it simple
                choice = input(f"\n{SovereignHUD.CYAN}>> [C*] Initialize Handshake for {skill_name}? [Y/n] {SovereignHUD.RESET}").strip().lower()
                if choice in ['', 'y', 'yes']:
                    print(f"\n{SovereignHUD.GREEN}>> ACCEL{SovereignHUD.RESET} Initiating deployment sequence...")
                    import subprocess
                    # Run the command
                    subprocess.run(["powershell", "-Command", f"& {{ python .agent/scripts/install_skill.py {skill_name} }}"], check=False)
                else:
                    print(f"\n{SovereignHUD.YELLOW}>> ABORT{SovereignHUD.RESET} Sequence cancelled.")
            except (EOFError, KeyboardInterrupt):
                # Handle cases where input isn't possible (e.g. non-interactive shells)
                print(f"\n{SovereignHUD.RED}>> SKIP{SovereignHUD.RESET} Non-interactive mode detected.")
                pass
            
            sys.exit(0) # Exit after handling proactive install to avoid redundant output
        elif recommendations:
            SovereignHUD.box_separator()
            for rec in recommendations[:2]:
               SovereignHUD.box_row("🔍 Discovery", f"{rec['trigger']} ({rec['score']:.2f})", SovereignHUD.MAGENTA)
        
        SovereignHUD.box_bottom()
        
        # Optional: Keep raw JSON for agent parsing if requested via --json
        if "--json" in sys.argv:
            print(json.dumps(trace, indent=2))
