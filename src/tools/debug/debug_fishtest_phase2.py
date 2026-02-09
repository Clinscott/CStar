import json
import os
import sys

# Add script path for engine import
sys.path.append(os.path.join('.agent', 'scripts'))
from sv_engine import SovereignVector


def debug_phase2():
    # Initialize engine
    engine = SovereignVector(
        thesaurus_path='thesaurus.md',
        corrections_path='.agent/corrections.json',
        stopwords_path='.agent/scripts/stopwords.json'
    )
    engine.load_core_skills()
    engine.load_skills_from_dir('.agent/skills')
    engine.load_skills_from_dir('skills_db', prefix='GLOBAL:')
    engine.build_index()

    # Load test cases
    with open('fishtest_phase2_data.json', 'r', encoding='utf-8') as f:
        cases = json.load(f).get('test_cases', [])

    passed = 0
    failures = []

    for case in cases:
        query = case['query']
        expected = case['expected']
        
        results = engine.search(query)
        top = results[0] if results else {}
        actual = top.get('trigger')
        score = top.get('score', 0.0)
        
        if actual == expected:
            passed += 1
        else:
            failures.append({
                "query": query,
                "expected": expected,
                "actual": actual,
                "score": score
            })

    for f in failures:
        print(f"FAIL: \"{f['query']}\" -> {f['actual']} (expected {f['expected']}, score {f['score']:.2f})")

    print(f"\nPASSED: {passed}/{len(cases)} ({passed/len(cases)*100:.1f}%)")

if __name__ == "__main__":
    debug_phase2()
