"""
[TOOL] Semantic Skill Auditor
Purpose: Detects intent collisions across the Manor to prevent semantic saturation.
"""

import sys
import os
import json
from pathlib import Path
from typing import List, Dict, Tuple

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[3]
sys.path.append(str(PROJECT_ROOT))

from src.core.engine.vector import SovereignVector
from src.core.sovereign_hud import SovereignHUD

def audit_manor_skills(threshold: float = 0.85):
    """
    Performs an All-vs-All semantic audit of skill activation words.
    """
    SovereignHUD.box_top("SKILL SEMANTIC AUDIT")
    
    engine = SovereignVector()
    engine.load_core_skills()
    engine.load_skills_from_dir(PROJECT_ROOT / "skills_db", prefix="GLOBAL:")
    engine.load_skills_from_dir(PROJECT_ROOT / "src" / "skills" / "local")
    
    # Extract activation patterns
    skill_definitions = engine.memory_db.search_intent("system", "", n_results=1000)
    
    collisions = []
    processed_pairs = set()

    for i, s1 in enumerate(skill_definitions):
        for j, s2 in enumerate(skill_definitions):
            if i >= j: continue
            
            id1, id2 = s1["trigger"], s2["trigger"]
            
            # Simple cosine-like similarity based on token overlap
            t1 = set(s1["description"].lower().replace(",", "").split())
            t2 = set(s2["description"].lower().replace(",", "").split())
            
            intersection = t1.intersection(t2)
            union = t1.union(t2)
            similarity = len(intersection) / len(union) if union else 0
            
            if similarity > threshold:
                collisions.append((id1, id2, similarity))

    if not collisions:
        SovereignHUD.log("PASS", f"No semantic collisions detected above {threshold:.2f}.")
    else:
        for id1, id2, sim in collisions:
            SovereignHUD.log("COLLISION", f"{id1} <-> {id2} (Similarity: {sim:.2f})", SovereignHUD.RED)
            
    SovereignHUD.box_bottom()
    return 0 if not collisions else 1

if __name__ == "__main__":
    audit_manor_skills()
