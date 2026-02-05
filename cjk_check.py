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

# CJK Query: "部署" (deploy)
q = "部署"
r = e.search(q)
if r:
    print(f"Query: {q}")
    print(f"  Score: {r[0]['score']:.4f}, Trigger: {r[0]['trigger']}")
else:
    print(f"Query: {q} -> No results")
