import sys
import os
sys.path.insert(0, '.agent/scripts')

from engine.vector import SovereignVector

e = SovereignVector(
    'thesaurus.qmd', 
    '.agent/corrections.json', 
    '.agent/scripts/stopwords.json'
)
e.load_core_skills()
e.build_index()

query = "catalog start"
r = e.search(query)
print(f"Tokens: {e.tokenize(query)}")
print(f"Trigger Map for 'start': {e.trigger_map.get('start')}")
if r:
    print(f"Top Result: {r[0]}")
else:
    print("No results found.")
