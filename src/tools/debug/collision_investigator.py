import json
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

class CollisionInvestigator:
    """[O.D.I.N.] Orchestration logic for intent collision analysis."""

    @staticmethod
    def execute() -> None:
        """
        Initializes SovereignVector, loads skills, builds the index,
        and runs a series of queries to demonstrate search functionality.
        """
        # Paths relative to the project root
        thesaurus = str(PROJECT_ROOT / 'thesaurus.qmd')
        corrections = str(PROJECT_ROOT / '.agent' / 'corrections.json')
        stopwords = str(PROJECT_ROOT / '.agent' / 'scripts' / 'stopwords.json')
        config_path = str(PROJECT_ROOT / '.agent' / 'config.json')

        e = SovereignVector(
            thesaurus,
            corrections,
            stopwords
        )

        try:
            with open(config_path) as f:
                config = json.load(f)
        except FileNotFoundError:
            print(f"Warning: '{config_path}' not found. Skipping FrameworkRoot skills.")
            config = {}

        print("Loading skills...")
        e.load_core_skills()
        e.load_skills_from_dir(str(PROJECT_ROOT / '.agent' / 'skills'))
        
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
    CollisionInvestigator.execute()
