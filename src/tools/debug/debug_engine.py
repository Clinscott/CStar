import os
import sys

# Add script path for engine import
sys.path.append(os.path.join(os.getcwd(), ".agent", "scripts"))
from sv_engine import SovereignVector


def debug_query(query) -> None:
    cur_dir = os.getcwd()
    base = os.path.join(cur_dir, ".agent")

    # Use .qmd
    thesaurus_path = os.path.join(cur_dir, "thesaurus.qmd")

    engine = SovereignVector(
        thesaurus_path=thesaurus_path,
        corrections_path=os.path.join(base, "corrections.json"),
        stopwords_path=os.path.join(base, "scripts", "stopwords.json")
    )
    engine.load_core_skills()
    engine.load_skills_from_dir(os.path.join(base, "skills"))

    skills_db = os.path.join(cur_dir, "skills_db")
    if os.path.exists(skills_db):
        engine.load_skills_from_dir(skills_db, prefix="GLOBAL:")

    engine.build_index()

    # Print a few thesaurus entries to verify loading
    print("\n--- Thesaurus Check ---")
    check_words = ['begin', 'initiate', 'aesthetics', 'e2e']
    for w in check_words:
        print(f"  {w}: {engine.thesaurus.get(w)}")

    print(f"\n--- Debugging Query: '{query}' ---")
    tokens = engine.tokenize(query)
    print(f"Tokens: {tokens}")

    weighted = engine.expand_query(query)
    sorted_weighted = sorted(weighted.items(), key=lambda x: x[1], reverse=True)
    print(f"Top 10 Expanded Tokens: {sorted_weighted[:10]}")

    results = engine.search(query)
    print("\nTop 5 Results:")
    for r in results[:5]:
        print(f"  {r['trigger']}: {r['score']:.4f} (Global: {r['is_global']})")

if __name__ == "__main__":
    queries = [
        "please initiate our project now"
    ]
    for q in queries:
        debug_query(q)
