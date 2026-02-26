#!/usr/bin/env python3
"""
[DEBUG] Quick Check
Lore: "A brief glance into the void."
Purpose: Executes a small set of queries to verify engine readiness.
"""

from src.core.engine.vector import SovereignVector


def run_quick_check() -> None:
    """
    Executes a set of baseline queries to verify the SovereignVector engine.
    """
    e = SovereignVector(
        thesaurus_path='thesaurus.qmd',
        corrections_path='.agent/corrections.json',
        stopwords_path='src/data/stopwords.json'
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
    run_quick_check()
