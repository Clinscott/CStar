import json
import os
import sys

sys.path.insert(0, '.agent/scripts')

from engine.vector import SovereignVector


def run_collision_investigation() -> None:
    """
    Initializes SovereignVector, loads skills, builds the index,
    and runs a series of queries to demonstrate search functionality.
    """
    e = SovereignVector(
        'thesaurus.qmd',
        '.agent/corrections.json',
        '.agent/scripts/stopwords.json'
    )

    try:
        with open('.agent/config.json') as f:
            config = json.load(f)
    except FileNotFoundError:
        print("Warning: '.agent/config.json' not found. Skipping FrameworkRoot skills.")
        config = {}

    print("Loading skills...")
    e.load_core_skills()
    e.load_skills_from_dir('.agent/skills')
    root = config.get("FrameworkRoot")
    if root and os.path.exists(os.path.join(root, "skills_db")):
        e.load_skills_from_dir(os.path.join(root, "skills_db"), prefix="GLOBAL:")

    print("Building index...")
    e.build_index()
    print("Index built.")

    queries = [
        "please wrap up our project now",
        "visuals refine",
        "please implement our ui now"
    ]

    print("\n--- Running Queries ---")
    for q in queries:
        r = e.search(q)
        print(f"Query: {q}")
        if r:
            for res in r[:3]:
                print(f"  {res['score']:.4f}: {res['trigger']}")
        else:
            print("  No results found.")
        print("-" * 20)

if __name__ == "__main__":
    # This assumes the script is run from a directory where '.agent', 'thesaurus.qmd' etc. exist
    run_collision_investigation()
