#!/usr/bin/env python3
"""
[DEBUG] Quick Check
Lore: "A brief glance into the void."
Purpose: Executes a small set of queries to verify engine readiness.
"""

from pathlib import Path

# Add core project root to path for shared imports
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
import sys
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from src.core.engine.vector import SovereignVector

class QuickCheck:
    """[O.D.I.N.] Orchestration logic for neural engine baseline readiness check."""

    @staticmethod
    def execute() -> None:
        """
        Executes a set of baseline queries to verify the SovereignVector engine.
        """
        # Paths relative to the project root
        thesaurus_path = str(PROJECT_ROOT / 'thesaurus.qmd')
        corrections_path = str(PROJECT_ROOT / '.agent' / 'corrections.json')
        stopwords_path = str(PROJECT_ROOT / 'src' / 'data' / 'stopwords.json')

        e = SovereignVector(
            thesaurus_path=thesaurus_path,
            corrections_path=corrections_path,
            stopwords_path=stopwords_path
        )
        e.load_core_skills()
        e.build_index()

        queries = [
            "please initiate our project now",
            "please polish our layout now",
            "error investigate"
        ]

        for q in queries:
            r = e.search(q)
            if r:
                print(f"Query: {q}")
                print(f"  Score: {r[0]['score']:.4f}, Trigger: {r[0]['trigger']}")

if __name__ == "__main__":
    QuickCheck.execute()
