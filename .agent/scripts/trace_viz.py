import sys
import os
import json
import re
import math

# Add script directory to path to allow imports
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

from sv_engine import SovereignVector, HUD

def visualize_trace(query):
    # Setup Paths
    base_path = os.path.dirname(current_dir) # .agent
    project_root = os.path.dirname(base_path) # Project Root
    
    # Load Engine
    config = {}
    config_path = os.path.join(base_path, "config.json")
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f: config = json.load(f)
        except: pass

    engine = SovereignVector(
        thesaurus_path=os.path.join(project_root, "thesaurus.md"), 
        corrections_path=os.path.join(base_path, "corrections.json"),
        stopwords_path=os.path.join(base_path, "scripts", "stopwords.json")
    )

    # Load Core Skills (Mirroring sv_engine.py)
    # Load Core Skills
    if hasattr(engine, 'load_core_skills'):
        engine.load_core_skills()
    else:
        # Fallback
        engine.add_skill("/lets-go", "start resume begin")
    
    engine.load_skills_from_dir(os.path.join(base_path, "skills"))
    
    # Load Global Skills
    framework_root = config.get("FrameworkRoot")
    if framework_root:
        global_path = os.path.join(framework_root, "skills_db")
        if os.path.exists(global_path):
            engine.load_skills_from_dir(global_path, prefix="GLOBAL:")
    
    engine.build_index()

    # --- VISUALIZATION LOGIC ---
    results = engine.search(query)
    if not results:
        print("No matches found.")
        return

    top_result = results[0]
    trigger = top_result['trigger']
    score = top_result['score']
    
    # Distributed Fishtest: Respect the Soul of the Trace
    # If a trace object was passed (hypothetically), we'd use that. 
    # But since this runs live on "query", we check the current config.
    # However, to simulate "Reading a trace", let's check if the query matches a known persona style
    # In V2, trace_viz will likely read .json files directly. For now, it respects the Live Engine's persona.
    
    # Force HUD refresh in case logic changed
    pass

    # Analyzye the "Why"
    q_tokens = engine.expand_query(query) # {token: weight}
    skill_text = engine.skills.get(trigger, "")
    s_tokens = engine.tokenize(skill_text)
    
    # Find overlap
    overlaps = []
    for qt, qw in q_tokens.items():
        if qt in s_tokens:
            # We found a match!
            # Count frequency in skill
            count = s_tokens.count(qt)
            idf = engine.idf.get(qt, 0)
            overlaps.append((qt, qw, count, idf))
    
    overlaps.sort(key=lambda x: x[3], reverse=True) # Sort by IDF (rarity)

    # --- GLOW UI RENDER ---
    print("\n")
    # SovereignFish Improvement: Show Persona in Header
    persona_label = f"[{HUD.PERSONA}]" if hasattr(HUD, 'PERSONA') else ""
    HUD.box_top(f"NEURAL TRACE {persona_label}")
    HUD.box_row("Query", query, HUD.BOLD, dim_label=True)
    HUD.box_row("Top Match", trigger, HUD.GREEN, dim_label=True)
    HUD.box_row("Confidence", f"{score:.4f}", HUD.GREEN if score > 0.8 else HUD.YELLOW, dim_label=True)
    HUD.box_separator()
    
    print(f"{HUD.CYAN_DIM}│{HUD.RESET} {HUD.MAGENTA}{'TOKEN':<15} {'WEIGHT':<10} {'IDF':<10} {'SIGNAL'}{HUD.RESET}")
    
    for token, weight, count, idf in overlaps[:5]: # Show top 5 contributing tokens
        signal_strength = weight * idf * math.log(1 + count)
        print(f"{HUD.CYAN_DIM}│{HUD.RESET} {token:<15} {weight:<10.2f} {idf:<10.2f} {HUD.CYAN}{'█' * int(signal_strength * 2)}{HUD.RESET}")
    
    HUD.box_bottom()
    print("\n")

if __name__ == "__main__":
    import math
    if len(sys.argv) < 2:
        print("Usage: python trace_viz.py <query>")
    else:
        visualize_trace(" ".join(sys.argv[1:]))
