import sys
import os
import json
import fileinput
from collections import defaultdict
from math import log

# Import Engine & UI
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from sv_engine import SovereignVector
from ui import HUD

def tune_weights(project_root):
    HUD.box_top("SOVEREIGN CYCLE: WEIGHT TUNING")
    
    # Paths
    thesaurus_path = os.path.join(project_root, "thesaurus.md")
    fishtest_path = os.path.join(project_root, "fishtest_data.json")
    
    if not os.path.exists(fishtest_path):
        HUD.log("FAIL", "Fishtest Data not found")
        return

    # Initialize Engine
    engine = SovereignVector(
        thesaurus_path=thesaurus_path,
        stopwords_path=os.path.join(os.path.dirname(__file__), "stopwords.json")
    )
    engine.load_core_skills()
    engine.load_skills_from_dir(os.path.join(os.path.dirname(os.path.dirname(__file__)), "skills"))
    engine.build_index()

    # Load Tests
    with open(fishtest_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    analysis = defaultdict(list)
    
    HUD.log("INFO", f"Analyzing {len(data['test_cases'])} cases...")
    
    updates = {}
    
    for case in data['test_cases']:
        query = case['query']
        expected = case['expected']
        
        # Analyze current performance
        results = engine.search(query)
        top = results[0] if results else None
        
        if not top or top['trigger'] != expected or top['score'] < 0.85:
            # We have a candidate for tuning
            if not top: continue
            
            HUD.log("WARN", f"Weak/Fail: {query} -> Exp: {expected} | Got: {top['trigger']} ({top['score']:.2f})")
            
            # 1. Identify Confusing Tokens
            # Tokens in query that are driving the Wrong Match
            q_tokens = engine.tokenize(query)
            
            target_text = engine.skills.get(expected, "")
            rival_text = engine.skills.get(top['trigger'], "")
            
            target_tokens = set(engine.tokenize(target_text))
            rival_tokens = set(engine.tokenize(rival_text))
            
            for t in q_tokens:
                # If token is in Rival but NOT Target, it's a poison pill for this case
                # We should lower its weight
                if t in rival_tokens and t not in target_tokens:
                    current_weight = engine.thesaurus.get(t, {}).get(t, 1.0) # Self-weight
                    updates[t] = max(0.1, current_weight - 0.1)
                    analysis[t].append(f"Down-vote from '{query}' (Favors {top['trigger']})")
                
                # If token is in Target but score is low, verify if we can boost it
                # Raising weight is dangerous, check global DF
                elif t in target_tokens and t not in rival_tokens:
                     updates[t] = min(2.0, updates.get(t, 1.0) + 0.1)
                     analysis[t].append(f"Up-vote from '{query}' (Unique to {expected})")

    HUD.box_separator()
    
    if not updates:
        HUD.log("PASS", "No optimizations found. System is stable.")
        return

    # Apply Updates
    HUD.log("INFO", f"Proposed {len(updates)} weight adjustments:")
    for token, weight in updates.items():
        reasons = analysis[token][:1]
        HUD.log("Optimizing", f"{token} -> {weight:.1f}", f"({len(analysis[token])} votes)")
    
    # In a real scenario, we would write to thesaurus.md. 
    # For now, we simulate the "Sovereign Cycle" by outputting the patch instructions.
    
    print("\n")
    print(f"{HUD.YELLOW}{HUD.BOLD}>> [Ω] DECREE: THESAURUS OPTIMIZATION REQUIRED{HUD.RESET}")
    print("Add the following to thesaurus.md:")
    for t, w in updates.items():
        print(f"- {t}: {t}:{w}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        tune_weights(sys.argv[1])
    else:
        # Default to standard layout
        tune_weights(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
