import os
import sys
from pathlib import Path

# Add core project root to path for shared imports
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

# Also add the .agent/scripts for legacy engine imports
SCRIPTS_DIR = PROJECT_ROOT / ".agent" / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.append(str(SCRIPTS_DIR))

from src.core.engine.vector import SovereignVector

class DebugEngine:
    """[O.D.I.N.] Orchestration logic for neural engine diagnostics."""

    @staticmethod
    def execute(query: str) -> None:
        """
        Initializes SovereignVector, loads skills, builds the index,
        and runs a series of diagnostics for a given query.
        """
        # Paths relative to the project root
        thesaurus_path = str(PROJECT_ROOT / "thesaurus.qmd")
        corrections_path = str(PROJECT_ROOT / ".agent" / "corrections.json")
        stopwords_path = str(PROJECT_ROOT / ".agent" / "scripts" / "stopwords.json")
        skills_dir = str(PROJECT_ROOT / ".agent" / "skills")
        global_skills_db = str(PROJECT_ROOT / "skills_db")

        engine = SovereignVector(
            thesaurus_path=thesaurus_path,
            corrections_path=corrections_path,
            stopwords_path=stopwords_path
        )
        engine.load_core_skills()
        engine.load_skills_from_dir(skills_dir)

        if os.path.exists(global_skills_db):
            engine.load_skills_from_dir(global_skills_db, prefix="GLOBAL:")

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
        DebugEngine.execute(q)
