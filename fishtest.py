import json
import subprocess
import os
import sys

def run_test():
    with open('fishtest_data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    test_cases = data['test_cases']
    passed = 0
    total = len(test_cases)
    
    print(f"--- CorvusStar FISHTEST: Statistical Verification ---")
    print(f"Total Cases: {total}\n")
    
    for case in test_cases:
        query = case['query']
        expected = case['expected']
        
        # Run engine with --json-only for reliable parsing
        cmd = ["python", ".agent/scripts/sv_engine.py", "--json-only", query]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        try:
            # Output is pure JSON
            trace = json.loads(result.stdout)
            
            top_match = trace.get('top_match', {})
            actual = top_match.get('trigger')
            score = top_match.get('score', 0)
            
            if actual == expected:
                status = "\033[32mPASS\033[0m"
                passed += 1
            else:
                status = f"\033[31mFAIL\033[0m (Got: {actual})"
            
            print(f"[{status}] Query: '{query}' -> {actual} ({score:.2f})")
        except Exception as e:
            print(f"[\033[31mERROR\033[0m] Query: '{query}' -> Parse Error: {e}")

    accuracy = (passed / total) * 100
    print(f"\nFinal Accuracy: {accuracy:.1f}% ({passed}/{total})")
    
    if accuracy < 100:
        sys.exit(1)

if __name__ == "__main__":
    run_test()
