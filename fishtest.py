import json
import os
import sys
import math
import time

# Add script path for engine import
sys.path.append(os.path.join(os.path.dirname(__file__), ".agent", "scripts"))
try:
    from sv_engine import SovereignVector, HUD
except ImportError:
    pass

class SPRT:
    """Sequential Probability Ratio Test for automated verification."""
    def __init__(self, alpha=0.05, beta=0.05, p0=0.95, p1=0.99):
        self.la = math.log(beta / (1 - alpha))
        self.lb = math.log((1 - beta) / alpha)
        self.p0, self.p1 = p0, p1

    def evaluate(self, passed, total):
        if total == 0: return "INCONCLUSIVE", HUD.YELLOW
        llr = (passed * math.log(self.p1 / self.p0)) + ((total - passed) * math.log((1 - self.p1) / (1 - self.p0)))
        if llr >= self.lb: return "PASS (Confirmed)", HUD.GREEN
        if llr <= self.la: return "FAIL (Regression)", HUD.RED
        return "INCONCLUSIVE", HUD.YELLOW

def run_test_case(engine: object, case: dict) -> tuple[bool, dict]:
    """[ALFRED] Secure test case execution with defensive validation."""
    if not isinstance(case, dict) or not case.get('query') or case.get('expected') is None:
        return False, {"actual": None, "score": 0, "reasons": ["Malformed Case"]}
    
    try:
        results = engine.search(case['query'])
        top = results[0] if results else {}
        actual, score, is_global = top.get('trigger'), top.get('score', 0), top.get('is_global', False)
        
        reasons = []
        if actual != case['expected'] and not (case['expected'] == "SovereignFish" and actual and "Fish" in actual):
            reasons.append(f"Expected '{case['expected']}', Got '{actual}'")
        if score < case.get('min_score', 0):
            reasons.append(f"Score {score:.2f} < Min {case['min_score']}")
        if 'should_be_global' in case and is_global != case['should_be_global']:
            reasons.append(f"Global mismatch: {is_global} != {case['should_be_global']}")
            
        return len(reasons) == 0, {"actual": actual, "score": score, "reasons": reasons}
    except Exception as e:
        return False, {"actual": None, "score": 0, "reasons": [f"Runtime Error: {str(e)[:40]}"]}

def initialize_engine(base_path: str, current_dir: str):
    config_path = os.path.join(base_path, "config.json")
    try:
        with open(config_path, 'r', encoding='utf-8') as f: config = json.load(f)
    except: config = {}
    
    engine = SovereignVector(
        thesaurus_path=os.path.join(current_dir, "thesaurus.md"),
        corrections_path=os.path.join(base_path, "corrections.json"),
        stopwords_path=os.path.join(base_path, "scripts", "stopwords.json")
    )
    engine.load_core_skills()
    engine.load_skills_from_dir(os.path.join(base_path, "skills"))
    
    root = config.get("FrameworkRoot")
    if root and os.path.exists(os.path.join(root, "skills_db")):
        engine.load_skills_from_dir(os.path.join(root, "skills_db"), prefix="GLOBAL:")
    
    engine.build_index()
    return engine, config.get("Persona", "ALFRED").upper()

def run_test():
    """[ALFRED] Optimized Fishtest runner with statistical SPRT verification."""
    cur_dir = os.path.dirname(os.path.abspath(__file__))
    base = os.path.join(cur_dir, ".agent")
    
    engine, persona = initialize_engine(base, cur_dir)
    HUD.PERSONA = persona
    
    target = 'fishtest_data.json'
    if len(sys.argv) > 2 and sys.argv[1] == '--file': target = sys.argv[2]
            
    try:
        with open(target, 'r', encoding='utf-8') as f: cases = json.load(f).get('test_cases', [])
    except Exception as e:
        print(f"FAILED: {str(e)}"); sys.exit(1)
    
    if not cases: HUD.log("WARN", "EMPTY", "No test cases."); sys.exit(0)

    HUD.box_top("Ω THE CRUCIBLE Ω" if persona == "ODIN" else "Linguistic Integrity Briefing")
    HUD.box_row("TIMESTAMP", time.strftime("%Y-%m-%d %H:%M:%S"), dim_label=True)
    HUD.box_row("POPULATION", f"{len(cases)} Cases", HUD.BOLD)
    HUD.box_separator()

    passed, start = 0, time.time()
    for case in cases:
        ok, info = run_test_case(engine, case)
        if ok: passed += 1
        else:
            HUD.box_row("FAIL", case['query'], HUD.RED)
            for r in info['reasons']: HUD.box_row("  -", r, dim_label=True)
            HUD.box_separator()

    duration = time.time() - start
    accuracy = (passed / len(cases)) * 100
    sprt_msg, sprt_color = SPRT().evaluate(passed, len(cases))

    HUD.box_row("ACCURACY", f"{accuracy:.1f}%", HUD.GREEN if accuracy == 100 else HUD.YELLOW)
    HUD.box_row("VERDICT", sprt_msg, sprt_color)
    HUD.box_row("LATENCY", f"{(duration/len(cases))*1000:.2f}ms/target", dim_label=True)
    HUD.box_bottom()
    
    if accuracy < 100: sys.exit(1)

if __name__ == "__main__": run_test()
