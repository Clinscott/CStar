import json
from src.core.engine.vector import SovereignVector

engine = SovereignVector()
source = r"C:\Users\Craig\Corvus\CorvusStar\tests\fixtures\fishtest_N100.json"

with open(source, 'r', encoding='utf-8') as f:
    data = json.load(f)

failures = []
for case in data['test_cases']:
    query = case['query']
    expected = case['expected']
    results = engine.search(query)
    actual = results[0]['trigger'] if results else None
    score = results[0]['score'] if results else 0
    
    if actual != expected:
        failures.append({
            "query": query,
            "expected": expected,
            "actual": actual,
            "score": score,
            "top_results": [{"trigger": r['trigger'], "score": r['score'], "note": r['note']} for r in results[:3]]
        })

print(f"FAILED CASES: {len(failures)}")
for f in failures:
    print(f"\nQuery: {f['query']}")
    print(f"  Expected: {f['expected']}, Actual: {f['actual']} (Score: {f['score']:.4f})")
    print("  Top Results:")
    for tr in f['top_results']:
        print(f"    - {tr['trigger']} ({tr['score']:.4f}) [{tr['note']}]")
