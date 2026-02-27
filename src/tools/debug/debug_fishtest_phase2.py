#!/usr/bin/env python3
"""
[DEBUG] Fishtest Phase 2 Diagnostic
Lore: "Scouring the edges of the ravens' perception."
Purpose: Runs an accuracy check against fishtest_phase2_data.json using the SovereignVector engine.
"""

import json
from pathlib import Path
from typing import Any

from src.core.engine.vector import SovereignVector


def run_debug_phase2(data_path: str = "fishtest_phase2_data.json") -> tuple[int, int]:
    """
    Runs the phase 2 fishtest diagnostic and returns results.

    Args:
        data_path: Path to the phase 2 fishtest JSON data.

    Returns:
        A tuple of (passed_count, total_count).
    """
    # Initialize engine with modern paths
    engine = SovereignVector(
        thesaurus_path='thesaurus.qmd',
        corrections_path='.agent/corrections.json',
        stopwords_path='src/data/stopwords.json'
    )
    engine.load_core_skills()
    engine.load_skills_from_dir('.agent/skills')
    engine.load_skills_from_dir('skills_db', prefix='GLOBAL:')
    engine.build_index()

    # Load test cases
    path = Path(data_path)
    if not path.exists():
        print(f"Error: {data_path} not found.")
        return 0, 0

    with path.open('r', encoding='utf-8') as f:
        cases = json.load(f).get('test_cases', [])

    passed: int = 0
    failures: list[dict[str, Any]] = []

    for case in cases:
        query: str = case['query']
        expected: str = case['expected']

        results = engine.search(query)
        top = results[0] if results else {}
        actual: str = top.get('trigger', "None")
        score: float = top.get('score', 0.0)

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

    total = len(cases)
    if total > 0:
        print(f"\nPASSED: {passed}/{total} ({passed/total*100:.1f}%)")
    else:
        print("\nNo test cases found.")

    return passed, total

if __name__ == "__main__":
    run_debug_phase2()
