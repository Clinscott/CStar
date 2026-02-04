import sys
import os
import json
from collections import defaultdict
from sv_engine import SovereignVector, HUD

class MetaLearner:
    """[ALFRED] Cognitive learning module for autonomous weight optimization."""
    def __init__(self, engine: SovereignVector):
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
            HUD.log("PASS", "Optimization Matrix Balanced")
            return
        HUD.log("INFO", f"Proposed {len(self.updates)} neural adjustments:")
        for t, w in self.updates.items():
            HUD.log("Optimizing", f"{t} -> {w:.1f}", f"({len(self.analysis[t])} signals)")
        
        print(f"\n{HUD.YELLOW}{HUD.BOLD}>> [Ω] DECREE: THESAURUS OPTIMIZATION REQUIRED{HUD.RESET}")
        for t, w in self.updates.items(): print(f"- {t}: {t}:{w:.2f}")

def tune_weights(project_root: str):
    """[ALFRED] Refactored tuning loop with encapsulated MetaLearner."""
    HUD.box_top("SOVEREIGN CYCLE: WEIGHT TUNING")
    db_path = os.path.join(project_root, "fishtest_data.json")
    if not os.path.exists(db_path): return

    engine = SovereignVector(os.path.join(project_root, "thesaurus.md"))
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

if __name__ == "__main__":
    rt = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    tune_weights(rt)
