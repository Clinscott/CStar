import json
import os
import sys
import math

# Add script path for engine import
sys.path.append(os.path.join(os.path.dirname(__file__), ".agent", "scripts"))
try:
    from sv_engine import SovereignVector
except ImportError:
    # Handle cases where pathing might differ (e.g. nested calls)
    pass

class SPRT:
    """Sequential Probability Ratio Test for automated verification."""
    def __init__(self, alpha=0.05, beta=0.05, elo_diff=10):
        self.alpha = alpha
        self.beta = beta
        self.elo_diff = elo_diff
        self.llr = 0.0
        # Decision boundaries
        self.la = math.log(beta / (1 - alpha))
        self.lb = math.log((1 - beta) / alpha)

    def update(self, passed, total):
        if total == 0: return "INCONCLUSIVE"
        
        # Simplified LLR calculation for Pass/Fail
        # P0: Baseline Accuracy (e.g., 0.95 or provided data)
        # P1: Improved Accuracy (e.g., 0.98)
        p0 = 0.95 
        p1 = 0.99
        
        # LLR = sum( ln( P(result|H1) / P(result|H0) ) )
        for _ in range(passed):
            self.llr += math.log(p1 / p0)
        for _ in range(total - passed):
            self.llr += math.log((1 - p1) / (1 - p0))

        if self.llr >= self.lb: return "PASS (Likely Improvement)"
        if self.llr <= self.la: return "FAIL (Likely Regression)"
        return "INCONCLUSIVE"

def run_test_case(engine: object, case: dict) -> tuple[bool, dict]:
    """Evaluates a single test case using the engine."""
    query = case['query']
    expected = case['expected']
    
    # Direct Engine Call
    results = engine.search(query)
    
    if results:
        top_match = results[0]
        actual = top_match.get('trigger')
        score = top_match.get('score', 0)
        is_global = top_match.get('is_global', False)
    else:
        actual = None
        score = 0
        is_global = False
        
    failed = False
    fail_reasons = []

    if actual != expected:
        # Special check for SovereignFish which can match polish/improvement/reform
        if expected == "SovereignFish" and actual is not None and "Fish" in actual:
            pass
        else:
            failed = True
            fail_reasons.append(f"Expected '{expected}', Got '{actual}'")

    min_score = case.get('min_score', 0)
    if score < min_score:
        failed = True
        fail_reasons.append(f"Score {score:.2f} < Min {min_score}")

    if 'should_be_global' in case:
        expected_global = case['should_be_global']
        if is_global != expected_global:
            failed = True
            fail_reasons.append(f"Global mismatch: Expected {expected_global}, Got {is_global}")

    return not failed, {
        "actual": actual,
        "score": score,
        "is_global": is_global,
        "reasons": fail_reasons
    }

def load_config(base_path: str) -> dict:
    config_path = os.path.join(base_path, "config.json")
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            pass
    return {}

def initialize_engine(current_dir: str, base_path: str, config: dict) -> object:
    engine = SovereignVector(
        thesaurus_path=os.path.join(current_dir, "thesaurus.md"),
        corrections_path=os.path.join(base_path, "corrections.json"),
        stopwords_path=os.path.join(base_path, "scripts", "stopwords.json")
    )
    
    engine.load_core_skills()
    engine.load_skills_from_dir(os.path.join(base_path, "skills"))
    
    framework_root = config.get("FrameworkRoot")
    if framework_root:
        global_path = os.path.join(framework_root, "skills_db")
        if os.path.exists(global_path):
            engine.load_skills_from_dir(global_path, prefix="GLOBAL:")

    engine.build_index()
    return engine

def render_results(passed: int, total: int, target_file: str, duration: float, sprt_result: str):
    from ui import HUD
    avg_time = (duration / total) * 1000 if total > 0 else 0
    accuracy = (passed / total) * 100
    
    passed_color = "\033[32m" if accuracy == 100 else "\033[33m"
    if accuracy < 90: passed_color = "\033[31m"
    
    sprt_color = "\033[32m" if "PASS" in sprt_result else "\033[31m"
    if "INCONCLUSIVE" in sprt_result: sprt_color = "\033[33m"

    HUD.box_row("ACCURACY", f"{accuracy:.1f}%", passed_color)
    HUD.box_row("VERDICT", sprt_result, sprt_color)
    HUD.box_row("LATENCY", f"{avg_time:.2f}ms/target", dim_label=True)
    HUD.box_bottom()
    
    if accuracy < 100:
        sys.exit(1)

def run_test():
    # Setup Paths
    current_dir = os.path.dirname(os.path.abspath(__file__))
    base_path = os.path.join(current_dir, ".agent")
    
    config = load_config(base_path)
    persona_name = config.get("Persona", "ALFRED").upper()
    
    try:
        from ui import HUD
        HUD.PERSONA = persona_name
    except ImportError:
        print("CRITICAL: Failed to load UI module.")
        sys.exit(1)

    engine = initialize_engine(current_dir, base_path, config)

    # Load Test Data
    target_file = 'fishtest_data.json'
    if len(sys.argv) > 1 and sys.argv[1] == '--file':
        if len(sys.argv) > 2:
            target_file = sys.argv[2]
            
    with open(target_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    test_cases = data['test_cases']
    passed = 0
    total = len(test_cases)
    sprt = SPRT()
    
    import time
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    
    # --- Persona Header ---
    title = "Ω THE CRUCIBLE (GATEKEEPER) Ω" if HUD.PERSONA == "ODIN" else "Linguistic Integrity Briefing"
    HUD.box_top(title)
    HUD.box_row("TIMESTAMP", timestamp, HUD.BOLD, dim_label=True)
    HUD.box_row("TARGET", target_file, HUD.BOLD)
    HUD.box_row("POPULATION", f"{total} Cases", HUD.BOLD)
    HUD.box_separator()

    import time
    start_time = time.time()

    for case in test_cases:
        passed_case, info = run_test_case(engine, case)
        if passed_case:
            passed += 1
        else:
            HUD.box_row("ERROR", f"INGEST FAILED", "\033[31m")
            HUD.box_row("QUERY", case['query'], dim_label=True)
            HUD.box_row("ACTUAL", f"{info['actual']} ({info['score']:.2f})", dim_label=True)
            HUD.box_separator()

    end_time = time.time()
    sprt_result = sprt.update(passed, total)
    render_results(passed, total, target_file, end_time - start_time, sprt_result)

if __name__ == "__main__":
    run_test()
