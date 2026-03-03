#!/usr/bin/env python3
"""
[DEBUG] Fishtest Diagnostic
Lore: "Verifying the accuracy of the ravens' sight."
Purpose: Runs a basic accuracy check against fishtest_data.json using the SovereignVector engine.
"""

import json
from pathlib import Path

# Add core project root to path for shared imports
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
import sys
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from src.core.engine.vector import SovereignVector

class FishtestLegacyDiagnostic:
    """[O.D.I.N.] Orchestration logic for legacy fishtest accuracy check."""

    @staticmethod
    def execute(data_path: str = "fishtest_data.json") -> tuple[int, int]:
        """
        Runs the fishtest diagnostic and returns the pass count and total count.
        """
        # Initialize engine with modern paths
        engine = SovereignVector(
            thesaurus_path=str(PROJECT_ROOT / 'thesaurus.qmd'),
            corrections_path=str(PROJECT_ROOT / '.agent' / 'corrections.json'),
            stopwords_path=str(PROJECT_ROOT / 'src' / 'data' / 'stopwords.json')
        )
        engine.load_core_skills()
        engine.load_skills_from_dir(str(PROJECT_ROOT / '.agent' / 'skills'))
        engine.load_skills_from_dir(str(PROJECT_ROOT / 'skills_db'), prefix='GLOBAL:')
        engine.build_index()

        # Load test cases
        path = PROJECT_ROOT / data_path
        if not path.exists():
            print(f"Error: {data_path} not found.")
            return 0, 0

        with path.open('r', encoding='utf-8') as f:
            cases = json.load(f).get('test_cases', [])

        passed = 0
        for case in cases:
            query = case['query']
            expected = case['expected']

            results = engine.search(query)
            top = results[0] if results else {}
            actual = top.get('trigger')
            score = top.get('score', 0)

            if actual == expected:
                passed += 1
            else:
                print(f'FAIL: "{query}" -> {actual} (expected {expected}, score {score:.2f})')

        total = len(cases)
        if total > 0:
            print(f"\nPASSED: {passed}/{total} ({100*passed/total:.1f}%)")
        else:
            print("\nNo test cases found.")

        return passed, total

if __name__ == "__main__":
    FishtestLegacyDiagnostic.execute()
