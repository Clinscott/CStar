import sys
import os

# 1. Path Setup: Inject the directory containing the engine module
# This assumes the script is run from the directory where .agent/ resides.
sys.path.insert(0, '.agent/scripts')

try:
    from engine.vector import SovereignVector
except ImportError:
    print("Error: SovereignVector engine could not be imported. Check path configuration.")
    sys.exit(1)

# Define paths for required resources
THE_FILE = 'thesaurus.qmd'
CORR_FILE = '.agent/corrections.json'
STOP_FILE = '.agent/scripts/stopwords.json'

try:
    # 2. Engine Initialization
    e = SovereignVector(
        THE_FILE, 
        CORR_FILE, 
        STOP_FILE
    )
    e.load_core_skills()
    e.build_index()

    # 3. Execution and Diagnostics
    query = "catalog start"
    r = e.search(query)
    
    # Required output checks (Gherkin validation points)
    print(f"Tokens: {e.tokenize(query)}")
    print(f"Trigger Map for 'start': {e.trigger_map.get('start')}")
    
    if r:
        print(f"Top Result: {r[0]}")
    else:
        print("No results found.")

    sys.exit(0)

except Exception as ex:
    print(f"Critical execution failure: {ex}")
    sys.exit(1)