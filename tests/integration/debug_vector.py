
import os
import sys

# Add project root to path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.append(PROJECT_ROOT)

from src.core.engine.vector import SovereignVector


def debug():
    engine = SovereignVector()
    engine.load_core_skills()

    # Optional global skills are explicit test input; never inspect live config.
    skills_db = os.environ.get("CSTAR_SKILLS_DB")
    if skills_db and os.path.isdir(skills_db):
        engine.load_skills_from_dir(skills_db, prefix="GLOBAL:")

    query = "run the browser automation"
    results = engine.search(query)
    print(f"Query: {query}")
    if results:
        top = results[0]
        print(f"Top Trigger: {top['trigger']}")
        print(f"Is Global: {top.get('is_global')}")
        print(f"Full Result: {top}")
    else:
        print("No results found.")

if __name__ == "__main__":
    debug()
