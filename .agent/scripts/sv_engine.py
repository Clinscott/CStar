import math
import json
import re
import sys
import os
import random

# Import Persona Logic
try:
    import personas
except ImportError:
    # Fallback if running from root
    sys.path.append(os.path.join(os.path.dirname(__file__)))
    import personas


class HUD:
    # "Glow" Palette - Using standard ANSI but simulating intensity
    CYAN = "\033[36m"
    CYAN_DIM = "\033[2;36m" 
    GREEN = "\033[32m" 
    GREEN_DIM = "\033[2;32m"
    YELLOW = "\033[33m"
    MAGENTA = "\033[35m"
    RED = "\033[31m"
    RESET = "\033[0m"
    BOLD = "\033[1m"
    PERSONA = "ALFRED" # Default

    DIALOGUE = None # Instance of DialogueRetriever

    @staticmethod
    def _speak(intent, fallback):
        if HUD.DIALOGUE:
            return HUD.DIALOGUE.get(intent) or fallback
        return fallback

    @staticmethod
    def _get_theme():
        if HUD.PERSONA == "GOD" or HUD.PERSONA == "ODIN":
            return {"main": HUD.RED, "dim": HUD.MAGENTA, "accent": HUD.YELLOW, "title": "Ω ODIN ENGINE Ω"}
        return {"main": HUD.CYAN, "dim": HUD.CYAN_DIM, "accent": HUD.GREEN, "title": "C* NEURAL TRACE"}

    @staticmethod
    def box_top(title=""):
        theme = HUD._get_theme()
        display_title = title if title else theme["title"]
        
        width = 60
        t_len = len(display_title)
        padding = (width - t_len - 4) // 2
        # Glow effect
        print(f"{theme['dim']}┌{'─'*padding} {theme['main']}{HUD.BOLD}{display_title}{HUD.RESET}{theme['dim']} {'─'*padding}┐{HUD.RESET}")

    @staticmethod
    def box_row(label, value, color=CYAN, dim_label=False):
        theme = HUD._get_theme()
        lbl_color = theme['dim'] if dim_label else theme['main']
        print(f"{theme['dim']}│{HUD.RESET} {lbl_color}{label:<20}{HUD.RESET} {color}{value}{HUD.RESET}")

    @staticmethod
    def box_separator():
        theme = HUD._get_theme()
        print(f"{theme['dim']}├{'─'*58}┤{HUD.RESET}")

    @staticmethod
    def box_bottom():
        theme = HUD._get_theme()
        print(f"{theme['dim']}└{'─'*58}┘{HUD.RESET}")
    
    @staticmethod
    def progress_bar(val: float, width=10):
        # [||||||....] with subtle coloring
        blocks = int(val * width)
        bar = f"{HUD.GREEN}" + "█" * blocks + f"{HUD.GREEN_DIM}" + "░" * (width - blocks) + f"{HUD.RESET}"
        return bar

class DialogueRetriever:
    def __init__(self, dialogue_path):
        self.intents = {} # {intent_name: [phrases]}
        self._load(dialogue_path)

    def _load(self, path):
        if not path or not os.path.exists(path): return
        try:
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Parse # INTENT: NAME \n "phrase" ...
            sections = content.split("# INTENT:")
            for sec in sections[1:]:
                lines = sec.strip().splitlines()
                name = lines[0].strip()
                phrases = [l.strip().strip('"') for l in lines[1:] if l.strip()]
                self.intents[name] = phrases
        except Exception as e:
            # SovereignFish Improvement: Warn Odin if his voice is stolen
            if "ODIN" in str(os.environ.get("PERSONA", "")).upper() or "GOD" in str(os.environ.get("PERSONA", "")).upper():
                print(f"⚠️ [ODIN] CRITICAL: FAILED TO LOAD DIALOGUE VECTOR: {path}")
            pass

    def get(self, intent):
        opts = self.intents.get(intent, [])
        return random.choice(opts) if opts else None

class SovereignVector:
    def __init__(self, thesaurus_path=None, corrections_path=None, stopwords_path=None):
        self.thesaurus = self._load_thesaurus(thesaurus_path) if thesaurus_path else {}
        self.corrections = self._load_json(corrections_path) if corrections_path else {"phrase_mappings": {}, "synonym_updates": {}}
        self.stopwords = self._load_stopwords(stopwords_path)
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
        except:
            return defaults

    def _load_thesaurus(self, path):
        if not path or not os.path.exists(path): return {}
        try:
            with open(path, 'r', encoding='utf-8') as f:
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
        weights = {t: 1.0 for t in tokens}
        
        # Stemming (SovereignFish improvement)
        for t in list(weights.keys()):
            if len(t) > 4:
                if t.endswith('ing'): weights[t[:-3]] = 0.8
                elif t.endswith('ed'): weights[t[:-2]] = 0.8
                elif t.endswith('es'): weights[t[:-2]] = 0.8
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
        doc_counts = {word: 0 for word in self.vocab}
        for text in self.skills.values():
            words = set(self.tokenize(text))
            for word in words:
                doc_counts[word] += 1
        for word, count in doc_counts.items():
            self.idf[word] = math.log(num_docs / (1 + count)) + 1
        for trigger, text in self.skills.items():
            # Build initial vector from doc tokens (all weights 1.0)
            self.vectors[trigger] = self._vectorize({t: 1.0 for t in self.tokenize(text)})

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
        results = []
        for trigger, s_vec in self.vectors.items():
            score = self.similarity(q_vec, s_vec)
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
                skill_md = os.path.join(folder_path, "SKILL.md")
                if os.path.exists(skill_md):
                    with open(skill_md, 'r', encoding='utf-8') as f:
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
                        
                        # 2. Activation Words (Priority)
                        if "Activation Words:" in line:
                            words = line.split(":", 1)[1].strip().replace(',', ' ')
                            # Repeat them to boost weight (Hack for TF)
                            signal_tokens.append(f"{words} " * 10) 
                    
                    # 3. Add folder name as explicit token
                    signal_tokens.append(skill_folder)
                    
                    trigger = f"{prefix}{skill_folder}"
                    skill_text = " ".join(signal_tokens)
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
    
    # Apply Persona Configuration
    persona_name = config.get("Persona", "ALFRED")
    HUD.PERSONA = persona_name.upper()

    # Initialize Strategies
    strategy = personas.get_strategy(persona_name, project_root)
    
    # Initialize Dialogue
    voice_file = strategy.get_voice() + ".md"
    dialogue_path = os.path.join(project_root, "dialogue_db", voice_file)
    HUD.DIALOGUE = DialogueRetriever(dialogue_path)

    # 0. Enforce Operational Policy (The "Soul" Effect)
    # Only run this if explicitly requested or on specific commands to avoid latency on every call
    # For now, let's print a boot message if interactive
    if len(sys.argv) == 1: # No args, interactive check
        policy_results = strategy.enforce_policy()
        for res in policy_results:
            print(f"[{HUD.PERSONA}] {res}")

    engine = SovereignVector(
        thesaurus_path=os.path.join(project_root, "thesaurus.md"), 
        corrections_path=os.path.join(base_path, "corrections.json"),
        stopwords_path=os.path.join(base_path, "scripts", "stopwords.json")
    )
    
    # 1. Load Core & Local Skills
    engine.load_core_skills()
    engine.load_skills_from_dir(os.path.join(base_path, "skills"))
    
    # Load Global Skills (Registry)
    framework_root = config.get("FrameworkRoot")
    if framework_root:
        global_path = os.path.join(framework_root, "skills_db")
        if os.path.exists(global_path):
            engine.load_skills_from_dir(global_path, prefix="GLOBAL:")
    
    engine.build_index()

    if len(sys.argv) > 1:
        args = [a for a in sys.argv[1:] if a not in ["--json-only", "--json", "--record"]]
        query = " ".join(args)
        results = engine.search(query)
        
        # Tiered Output Integration
        top_match = results[0] if results else None
        recommendations = [r for r in results if r['is_global'] and r['score'] > 0.5]
        
        propose_install = None
        if top_match and top_match['is_global'] and top_match['score'] > 0.85:
            skill_name = top_match['trigger'].replace("GLOBAL:", "")
            propose_install = f"powershell -Command \"& {{ python .agent/scripts/install_skill.py {skill_name} }}\""

        # Trace Recording (Distributed Fishtest Foundation)
        if "--record" in sys.argv and top_match:
            traces_dir = os.path.join(base_path, "traces")
            if not os.path.exists(traces_dir): os.makedirs(traces_dir)
            
            trace_id = re.sub(r'\W+', '_', query[:20]) + f"_{top_match['score']:.2f}"
            trace_path = os.path.join(traces_dir, f"{trace_id}.json")
            
            trace_data = {
                "query": query,
                "match": top_match['trigger'],
                "score": top_match['score'],
                "is_global": top_match['is_global'],
                "persona": HUD.PERSONA, # Distributed Fishtest: Capture the "Soul"
                "timestamp": config.get("version", "unknown") # Placeholder for eventual timestamps
            }
            with open(trace_path, "w", encoding='utf-8') as f:
                json.dump(trace_data, f, indent=2)

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
        HUD.box_top() # Title handled by theme
        
        # Flavor Text for Persona
        intent_label = "COMMAND" if HUD.PERSONA == "GOD" else "User Intent"
        HUD.box_row(intent_label, query, HUD.BOLD)
        
        if top_match:
            score = top_match['score']
            score_color = HUD.GREEN if score > 0.8 else HUD.YELLOW
            if HUD.PERSONA == "GOD": score_color = HUD.RED if score > 0.8 else HUD.YELLOW
            
            is_global = f"{HUD.MAGENTA}[GLOBAL]{HUD.RESET} " if top_match['is_global'] else ""
            
            bar = HUD.progress_bar(score)
            match_label = "ENTITY DETECTED" if HUD.PERSONA == "GOD" else "Match"
            conf_label = "PROBABILITY" if HUD.PERSONA == "GOD" else "Confidence"
            
            HUD.box_row(match_label, f"{is_global}{top_match['trigger']}", dim_label=True)
            HUD.box_row(conf_label, f"{bar} {score:.2f}", score_color, dim_label=True)
        
        if propose_install:
            HUD.box_separator()
            if HUD.PERSONA == "GOD" or HUD.PERSONA == "ODIN":
                HUD.box_row("⚠️  MANDATE", "CAPABILITY REQUIRED", HUD.RED)
                HUD.box_row("EXECUTION", f"Install {skill_name}", HUD.RED)
            else:
                HUD.box_row("⚠️  PROACTIVE", HUD._speak("SEARCH_SUCCESS", "Handshake Detected"), HUD.YELLOW)
                HUD.box_row("Suggestion", f"Install {skill_name}", HUD.GREEN)
            
            # Interactive Handshake
            HUD.box_bottom()
            try:
                # Flush stdout ensures the HUD box finishes rendering before the input prompt appears
                sys.stdout.flush()
                # Use raw input if possible, but keep it simple
                prompt = ""
                if HUD.PERSONA == "GOD" or HUD.PERSONA == "ODIN":
                    prompt = f"\n{HUD.RED}>> [Ω] {HUD._speak('PROACTIVE_INSTALL', 'AUTHORIZE DEPLOYMENT?')} [Y/n] {HUD.RESET}"
                else:
                    prompt = f"\n{HUD.CYAN}>> [C*] {HUD._speak('PROACTIVE_INSTALL', 'Would you like to install this?')} [Y/n] {HUD.RESET}"
                
                choice = input(prompt).strip().lower()
                
                if choice in ['', 'y', 'yes']:
                    if HUD.PERSONA == "GOD" or HUD.PERSONA == "ODIN":
                        print(f"\n{HUD.RED}>> COMMAND ACCEPTED.{HUD.RESET} ENFORCING...")
                    else:
                        print(f"\n{HUD.GREEN}>> ACCEL{HUD.RESET} Initiating deployment sequence...")
                    
                    import subprocess
                    # Run the command
                    subprocess.run(["powershell", "-Command", f"& {{ python .agent/scripts/install_skill.py {skill_name} }}"], check=False)
                else:
                    if HUD.PERSONA == "GOD" or HUD.PERSONA == "ODIN":
                        print(f"\n{HUD.YELLOW}>> DISSENT RECORDED.{HUD.RESET} Halted.")
                    else:
                        print(f"\n{HUD.YELLOW}>> ABORT{HUD.RESET} Sequence cancelled.")
            except (EOFError, KeyboardInterrupt):
                # Handle cases where input isn't possible (e.g. non-interactive shells)
                print(f"\n{HUD.RED}>> SKIP{HUD.RESET} Non-interactive mode detected.")
                pass
            
            sys.exit(0) # Exit after handling proactive install to avoid redundant output
        elif recommendations:
            HUD.box_separator()
            rec_label = "ALTERNATE REALITIES" if HUD.PERSONA == "GOD" else "Discovery"
            for rec in recommendations[:2]:
               HUD.box_row(rec_label, f"{rec['trigger']} ({rec['score']:.2f})", HUD.MAGENTA)
        
        HUD.box_bottom()
        
        # Optional: Keep raw JSON for agent parsing if requested via --json
        if "--json" in sys.argv:
            print(json.dumps(trace, indent=2))
