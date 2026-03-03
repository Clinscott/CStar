import json
import os
import sys
from collections import defaultdict
from pathlib import Path

# Add core project root to path for shared imports
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from src.core.engine.vector import SovereignVector
from src.core.sovereign_hud import SovereignHUD


class MetaLearner:
    """[ALFRED] Cognitive learning module for autonomous weight optimization."""
    def __init__(self, engine: SovereignVector) -> None:
        self.engine = engine
        self.updates: dict = {}
        self.analysis = defaultdict(list)

    def analyze_failure(self, query: str, expected: str, actual: dict) -> None:
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

    def report(self) -> None:
        """Display the proposed optimization plan."""
        if not self.updates:
            SovereignHUD.log("PASS", "Optimization Matrix Balanced")
            return
        SovereignHUD.log("INFO", f"Proposed {len(self.updates)} neural adjustments:")
        for t, w in self.updates.items():
            SovereignHUD.log("Optimizing", f"{t} -> {w:.1f}", f"({len(self.analysis[t])} signals)")

        print(f"\n{SovereignHUD.YELLOW}{SovereignHUD.BOLD}>> [Ω] DECREE: THESAURUS OPTIMIZATION REQUIRED{SovereignHUD.RESET}")
        for t, w in self.updates.items(): print(f"- {t}: {t}:{w:.2f}")

    def apply_updates(self, thesaurus_path: str) -> None:
        """Persist the learned weights back to the thesaurus file."""
        if not self.updates or not os.path.exists(thesaurus_path):
            return

        SovereignHUD.log("INFO", f"Writing {len(self.updates)} weight updates to {thesaurus_path}...")

        try:
            with open(thesaurus_path, encoding='utf-8') as f:
                lines = f.readlines()

            new_lines = []
            updated_tokens = set()

            for line in lines:
                if not line.strip().startswith("- "):
                    new_lines.append(line)
                    continue

                parts = line.split(":", 1)
                if len(parts) < 2:
                    new_lines.append(line)
                    continue

                key = parts[0].strip("- ").strip().lower()

                if key in self.updates:
                    rest = parts[1].strip()
                    syns = [s.strip() for s in rest.split(",")]
                    new_syns = []
                    found_self = False

                    target_weight = self.updates[key]

                    for s in syns:
                        if ":" in s:
                            s_parts = s.split(":")
                            s_key = s_parts[0]
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

            for t, w in self.updates.items():
                if t not in updated_tokens:
                    new_lines.append(f"- {t}: {t}:{w:.2f}\n")

            with open(thesaurus_path, 'w', encoding='utf-8') as f:
                f.writelines(new_lines)

            SovereignHUD.log("SUCCESS", "Neural weights persisted.")

        except Exception as e:
            SovereignHUD.log("ERROR", f"Failed to persist weights: {e}")

class WeightTuner:
    """[O.D.I.N.] Orchestration logic for neural weight tuning."""

    @staticmethod
    def execute(project_root: str) -> None:
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
            return candidates[1]

        engine = SovereignVector(_res("thesaurus.qmd"))
        engine.load_core_skills()
        engine.load_skills_from_dir(os.path.join(os.path.dirname(os.path.dirname(__file__)), "skills"))
        engine.build_index()

        with open(db_path, encoding='utf-8') as f: data = json.load(f)
        learner = MetaLearner(engine)

        for case in data.get('test_cases', []):
            res = engine.search(case['query'])
            top = res[0] if res else None
            if not top or top['trigger'] != case['expected'] or top['score'] < 0.85:
                if top: learner.analyze_failure(case['query'], case['expected'], top)

        learner.report()
        if learner.updates:
            t_path = _res("thesaurus.qmd")
            learner.apply_updates(t_path)

if __name__ == "__main__":
    rt = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    WeightTuner.execute(rt)
