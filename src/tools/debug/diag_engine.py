import sys
import os

# Add script path for engine import
sys.path.append(os.path.join('.agent', 'scripts'))
from sv_engine import SovereignVector

engine = SovereignVector(
    thesaurus_path='thesaurus.md',
    corrections_path='.agent/corrections.json',
    stopwords_path='.agent/scripts/stopwords.json'
)
engine.load_core_skills()
engine.load_skills_from_dir('.agent/skills')
engine.load_skills_from_dir('skills_db', prefix='GLOBAL:')
engine.build_index()

test_words = ["updates", "document", "plan", "execute", "verify"]
for w in test_words:
    in_thesaurus = w in engine.thesaurus
    syns = engine.thesaurus.get(w, {}) if in_thesaurus else "N/A"
    print(f"Word: {w} | In Thesaurus: {in_thesaurus} | Syns: {syns}")

print("\nSearch results for 'updates':")
results = engine.search("updates")
for r in results[:3]:
    print(f"  {r['trigger']} | score: {r['score']:.4f}")
