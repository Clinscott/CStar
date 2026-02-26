import json
import os
import sys
from collections import defaultdict

from src.core.sovereign_hud import SovereignHUD
from src.core.engine.vector import SovereignVector


class MetaLearner:
    """[ALFRED] Cognitive learning module for autonomous weight optimization."""
    def __init__(self, engine: SovereignVector) -> None:
        self.engine = engine
        self.updates: dict = {}
        self.analysis = defaultdict(list)

    def analyze_failure(self, query: str, expected: str, actual: dict):
        """Diagnose a single test failure and propose weight shifts."""
        q_tokens = self.engine.tokenize(query)
        target_tokens = set(self.engine.tokenize(self.engine.skills.get(expected, "")))
        rival_tokens = set(self.engine.tokenize(self.engine.skills.get(actual['trigger'], "")))
        
        for t in q_tokens:
            if t in rival_tokens and t not in target_tokens:
                curr = self.engine.thesaurus.get(t, {}).get(t, 1.0)
                self.updates[t] = max(0.1, curr - 0.1)
                self.analysis[t].append(f"Down: Rivals {actual['trigger']}")
            elif t in target_tokens and t not in rival_tokens:
                self.updates[t] = min(2.0, self.updates.get(t, 1.0) + 0.1)
                self.analysis[t].append(f"Up: Unique to {expected}")

    def report(self):
        """Display the proposed optimization plan."""
        if not self.updates:
            SovereignHUD.log("PASS", "Optimization Matrix Balanced")
            return
        SovereignHUD.log("INFO", f"Proposed {len(self.updates)} neural adjustments:")
        for t, w in self.updates.items():
            SovereignHUD.log("Optimizing", f"{t} -> {w:.1f}", f"({len(self.analysis[t])} signals)")
        
        print(f"\n{SovereignHUD.YELLOW}{SovereignHUD.BOLD}>> [Ω] DECREE: THESAURUS OPTIMIZATION REQUIRED{SovereignHUD.RESET}")
        for t, w in self.updates.items(): print(f"- {t}: {t}:{w:.2f}")

    def apply_updates(self, thesaurus_path: str):
        """Persist the learned weights back to the thesaurus file."""
        if not self.updates or not os.path.exists(thesaurus_path):
            return

        SovereignHUD.log("INFO", f"Writing {len(self.updates)} weight updates to {thesaurus_path}...")
        
        try:
            with open(thesaurus_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            new_lines = []
            updated_tokens = set()

            # Regex to parse "- word: synonym:weight, synonym:weight"
            # We assume we are updating the weight of the word itself (word:word:weight)
            # or adding it if missing?
            # For simplicity in this architectural fix, we update existing entries.
            
            for line in lines:
                if not line.strip().startswith("- "):
                    new_lines.append(line)
                    continue
                
                # Parse key
                parts = line.split(":", 1)
                if len(parts) < 2:
                    new_lines.append(line)
                    continue
                    
                key = parts[0].strip("- ").strip().lower()
                
                if key in self.updates:
                    # Reconstruct the line with new weight for the self-referential synonym
                    # This is a simplification. Real implementation might need robust parsing.
                    # Current format: - word: synonym:weight, synonym:weight
                    rest = parts[1].strip()
                    syns = [s.strip() for s in rest.split(",")]
                    new_syns = []
                    found_self = False
                    
                    target_weight = self.updates[key]

                    for s in syns:
                        if ":" in s:
                            s_key, s_w = s.split(":")[:2]
                            if s_key.strip().lower() == key:
                                new_syns.append(f"{s_key}:{target_weight:.2f}")
                                found_self = True
                            else:
                                new_syns.append(s)
                        else:
                            new_syns.append(s)
                    
                    if not found_self:
                        new_syns.insert(0, f"{key}:{target_weight:.2f}")
                        
                    new_lines.append(f"- {key}: {', '.join(new_syns)}\n")
                    updated_tokens.add(key)
                else:
                    new_lines.append(line)
            
            # Append new keys if needed (optional, but good for learning loop)
            for t, w in self.updates.items():
                if t not in updated_tokens:
                    new_lines.append(f"- {t}: {t}:{w:.2f}\n")

            with open(thesaurus_path, 'w', encoding='utf-8') as f:
                f.writelines(new_lines)
                
            SovereignHUD.log("SUCCESS", "Neural weights persisted.")

        except Exception as e:
            SovereignHUD.log("ERROR", f"Failed to persist weights: {e}")

def tune_weights(project_root: str):
    """[ALFRED] Refactored tuning loop with encapsulated MetaLearner."""
    SovereignHUD.box_top("SOVEREIGN CYCLE: WEIGHT TUNING")
    db_path = os.path.join(project_root, "fishtest_data.json")
    if not os.path.exists(db_path): return

    def _res(fname):
        candidates = [
            os.path.join(project_root, fname.replace('.md', '.qmd')),
            os.path.join(project_root, fname),
            os.path.join(project_root, "src", "data", fname.replace('.md', '.qmd')),
            os.path.join(project_root, "src", "data", fname)
        ]
        for c in candidates:
            if os.path.exists(c): return c
        return candidates[1] # Default to root md if nothing found

    engine = SovereignVector(_res("thesaurus.qmd"))
    engine.load_core_skills()
    engine.load_skills_from_dir(os.path.join(os.path.dirname(os.path.dirname(__file__)), "skills"))
    engine.build_index()

    with open(db_path, 'r', encoding='utf-8') as f: data = json.load(f)
    learner = MetaLearner(engine)
    
    for case in data.get('test_cases', []):
        res = engine.search(case['query'])
        top = res[0] if res else None
        if not top or top['trigger'] != case['expected'] or top['score'] < 0.85:
            if top: learner.analyze_failure(case['query'], case['expected'], top)

    learner.report()
    
    # Close the loop
    if learner.updates:
        t_path = _res("thesaurus.qmd")
        learner.apply_updates(t_path)

if __name__ == "__main__":
    rt = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    tune_weights(rt)