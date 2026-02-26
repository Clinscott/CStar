#!/usr/bin/env python3
"""
[DEBUG] Diagnostic Engine
Lore: "Probing the neural synapses of the ravens."
Purpose: Tests specific word resonance in the thesaurus and search engine.
"""

from src.core.engine.vector import SovereignVector


def run_diag() -> None:
    """
    Runs a diagnostic check on specific keywords and search queries.
    Prints the thesaurus status and top search results.
    """
    engine = SovereignVector(
        thesaurus_path='thesaurus.qmd',
        corrections_path='.agent/corrections.json',
        stopwords_path='src/data/stopwords.json'
    )
    engine.load_core_skills()
    engine.load_skills_from_dir('.agent/skills')
    engine.load_skills_from_dir('skills_db', prefix='GLOBAL:')
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
    run_diag()
