import json
import os
import sys

sys.path.append(os.path.join('.agent', 'scripts'))
from sv_engine import SovereignVector

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
with open('fishtest_data.json', 'r', encoding='utf-8') as f:
    cases = json.load(f).get('test_cases', [])

# Test each case
passed = 0
failed = 0
for case in cases:
    results = engine.search(case['query'])
    top = results[0] if results else {}
    actual = top.get('trigger')
    score = top.get('score', 0)
    expected = case['expected']
    if actual == expected:
        passed += 1
    else:
        failed += 1
        print(f'FAIL: "{case["query"]}" -> {actual} (expected {expected}, score {score:.2f})')

print(f"\nPASSED: {passed}/{len(cases)} ({100*passed/len(cases):.1f}%)")
