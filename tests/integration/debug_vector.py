
import os
import sys
from pathlib import Path

# Add project root to path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.append(PROJECT_ROOT)

from src.core.engine.vector import SovereignVector

def debug():
    engine = SovereignVector()
    engine.load_core_skills()
    
    # Check if skills_db exists to load global skills
    import json
    config_path = os.path.join(PROJECT_ROOT, ".agent", "config.json")
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
            root = config.get("system", {}).get("framework_root")
            if root and os.path.exists(os.path.join(root, "skills_db")):
                engine.load_skills_from_dir(os.path.join(root, "skills_db"), prefix="GLOBAL:")
    except:
        pass

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
