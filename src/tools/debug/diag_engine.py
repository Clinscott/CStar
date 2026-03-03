#!/usr/bin/env python3
"""
[DEBUG] Diagnostic Engine
Lore: "Probing the neural synapses of the ravens."
Purpose: Tests specific word resonance in the thesaurus and search engine.
"""

from pathlib import Path

# Add core project root to path for shared imports
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
import sys
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from src.core.engine.vector import SovereignVector

class DiagnosticEngine:
    """[O.D.I.N.] Orchestration logic for neural engine keyword diagnostics."""

    @staticmethod
    def execute() -> None:
        """
        Runs a diagnostic check on specific keywords and search queries.
        Prints the thesaurus status and top search results.
        """
        # Paths relative to the project root
        thesaurus_path = str(PROJECT_ROOT / 'thesaurus.qmd')
        corrections_path = str(PROJECT_ROOT / '.agent' / 'corrections.json')
        stopwords_path = str(PROJECT_ROOT / 'src' / 'data' / 'stopwords.json')

        engine = SovereignVector(
            thesaurus_path=thesaurus_path,
            corrections_path=corrections_path,
            stopwords_path=stopwords_path
        )
        engine.load_core_skills()
        engine.load_skills_from_dir(str(PROJECT_ROOT / '.agent' / 'skills'))
        engine.load_skills_from_dir(str(PROJECT_ROOT / 'skills_db'), prefix='GLOBAL:')
        engine.build_index()

        test_words = ["updates", "document", "plan", "execute", "verify"]
        for w in test_words:
            in_thesaurus = w in engine.thesaurus
            syns = engine.thesaurus.get(w, {}) if in_thesaurus else "N/A"
            print(f"Word: {w} | In Thesaurus: {in_thesaurus} | Syns: {syns}")

        print("\nSearch results for 'updates':")
        results = engine.search("updates")
        for r in results[:3]:
            print(f"  {r['trigger']} | score: {r['score']:.4f}")

if __name__ == "__main__":
    DiagnosticEngine.execute()
