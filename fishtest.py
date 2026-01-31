import json
import os
import sys
import math

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

def run_test():
    # Import Engine In-Process (Optimization Phase 1)
    # Import Engine In-Process (Optimization Phase 1)
    try:
        sys.path.append(os.path.join(os.path.dirname(__file__), ".agent", "scripts"))
        from sv_engine import SovereignVector
    except ImportError:
        # Fallback for direct execution
        sys.path.append(os.path.join(os.path.dirname(__file__), ".agent", "scripts"))
        from sv_engine import SovereignVector

    # Initialize Engine Once
    base_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".agent")
    engine = SovereignVector(
        thesaurus_path=os.path.join(os.path.dirname(base_path), "thesaurus.md"),
        corrections_path=os.path.join(base_path, "corrections.json"),
        stopwords_path=os.path.join(base_path, "scripts", "stopwords.json")
    )
    
    # Load Skills
    skills_dir = os.path.join(base_path, "skills")
    if os.path.exists(skills_dir):
        engine.load_skills_from_dir(skills_dir)
        
    # Load Core Skills from Engine Definition (DRY)
    if hasattr(engine, 'load_core_skills'):
        engine.load_core_skills()
    else:
        # Fallback if engine improperly imported or old version
        engine.add_skill("/lets-go", "start resume begin")

    # Load Global Skills if Configured
    config_path = os.path.join(base_path, "config.json")
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
                framework_root = config.get("FrameworkRoot")
                if framework_root:
                    global_path = os.path.join(framework_root, "skills_db")
                    if os.path.exists(global_path):
                        engine.load_skills_from_dir(global_path, prefix="GLOBAL:")
        except: pass

    engine.build_index()

    # Load Test Data
    target_file = 'fishtest_data.json'
    if len(sys.argv) > 1 and sys.argv[1] == '--file':
        if len(sys.argv) > 2:
            target_file = sys.argv[2]
            
    print(f"Loading test data from: {target_file}")
    with open(target_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    test_cases = data['test_cases']
    passed = 0
    total = len(test_cases)
    
    # Initialize SPRT
    sprt = SPRT()
    
    print(f"--- CorvusStar FISHTEST: Statistical Verification (SPRT) ---")
    print(f"Total Cases: {total}\n")
    
    import time
    start_time = time.time()

    for case in test_cases:
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

        if not failed:
            status = "\033[32mPASS\033[0m"
            passed += 1
        else:
            status = f"\033[31mFAIL\033[0m"
            print(f"[{status}] Query: '{query}' -> {actual} ({score:.2f}) -> {', '.join(fail_reasons)}")

    end_time = time.time()
    duration = end_time - start_time
    avg_time = (duration / total) * 1000 if total > 0 else 0

    accuracy = (passed / total) * 100
    sprt_result = sprt.update(passed, total)
    
    # SovereignFish Improvement: Colorized SPRT
    sprt_color = "\033[32m" if "PASS" in sprt_result else "\033[31m"
    if "INCONCLUSIVE" in sprt_result: sprt_color = "\033[33m" # Yellow

    print(f"\nFinal Accuracy: {accuracy:.1f}% ({passed}/{total})")
    print(f"SPRT Status:   {sprt_color}{sprt_result}\033[0m (LLR: {sprt.llr:.2f})")
    print(f"Performance:   {duration:.4f}s total ({avg_time:.2f}ms/call)")
    
    if accuracy < 100:
        sys.exit(1)

if __name__ == "__main__":
    run_test()
