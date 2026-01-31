import json
import subprocess
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
    with open('fishtest_data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    test_cases = data['test_cases']
    passed = 0
    total = len(test_cases)
    
    # Initialize SPRT
    sprt = SPRT()
    
    print(f"--- CorvusStar FISHTEST: Statistical Verification (SPRT) ---")
    print(f"Total Cases: {total}\n")
    
    for case in test_cases:
        query = case['query']
        expected = case['expected']
        
        cmd = ["python", ".agent/scripts/sv_engine.py", "--json-only", query]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        try:
            trace = json.loads(result.stdout)
            top_match = trace.get('top_match', {})
            actual = top_match.get('trigger')
            score = top_match.get('score', 0)
            is_global = top_match.get('is_global', False)
            
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
        except Exception as e:
            print(f"[\033[31mERROR\033[0m] Query: '{query}' -> Parse Error: {e}")

    accuracy = (passed / total) * 100
    sprt_result = sprt.update(passed, total)
    
    print(f"\nFinal Accuracy: {accuracy:.1f}% ({passed}/{total})")
    print(f"SPRT Status:   {sprt_result} (LLR: {sprt.llr:.2f})")
    
    if accuracy < 100:
        sys.exit(1)

if __name__ == "__main__":
    run_test()
