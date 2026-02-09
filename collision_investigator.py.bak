import sys
import os
sys.path.insert(0, '.agent/scripts')

from engine.vector import SovereignVector

e = SovereignVector(
    'thesaurus.qmd', 
    '.agent/corrections.json', 
    '.agent/scripts/stopwords.json'
)
# Load configuration like fishtest.py
import json
with open('.agent/config.json', 'r') as f: config = json.load(f)
e.load_core_skills()
e.load_skills_from_dir('.agent/skills')
root = config.get("FrameworkRoot")
if root and os.path.exists(os.path.join(root, "skills_db")):
    e.load_skills_from_dir(os.path.join(root, "skills_db"), prefix="GLOBAL:")
e.build_index()

queries = [
    "please wrap up our project now",
    "visuals refine",
    "please implement our ui now"
]

for q in queries:
    r = e.search(q)
    print(f"Query: {q}")
    for res in r[:3]:
        print(f"  {res['score']:.4f}: {res['trigger']}")
    print("-" * 20)
