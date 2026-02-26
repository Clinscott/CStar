import argparse
import glob
import json
import math
import os
import sys

# Fix: Ensure Any is available for CI type hints
from collections import defaultdict
from typing import Any

# Add script directory to path to allow imports
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

from sv_engine import SovereignVector

from src.core.sovereign_hud import SovereignHUD

# --- CONFIGURATION (SYMMETRY MANDATE) ---
# Themes are now handled by ui.SovereignHUD based on SovereignHUD.PERSONA setting

# --- UTILITIES ---

def load_json(path):
    if not os.path.exists(path): return {}
    try:
        with open(path, encoding='utf-8') as f: return json.load(f)
    except: return {}

def get_engine():
    # Setup Paths
    base_path = os.path.dirname(current_dir) # .agent
    project_root = os.path.dirname(base_path) # Project Root

    # Load Config for Framework Root
    config = load_json(os.path.join(base_path, "config.json"))

    engine = SovereignVector(
        thesaurus_path=os.path.join(project_root, "thesaurus.md"),
        corrections_path=os.path.join(base_path, "corrections.json"),
        stopwords_path=os.path.join(base_path, "scripts", "stopwords.json")
    )

    # Load Skills
    if hasattr(engine, 'load_core_skills'):
        engine.load_core_skills()
    else:
        engine.add_skill("/lets-go", "start resume begin")

    engine.load_skills_from_dir(os.path.join(base_path, "skills"))

    # Global Skills
    framework_root = config.get("FrameworkRoot")
    if framework_root:
        global_path = os.path.join(framework_root, "skills_db")
        if os.path.exists(global_path):
            engine.load_skills_from_dir(global_path, prefix="GLOBAL:")

    engine.build_index()
    return engine


# --- RENDERER (IDENTITY ISOLATION) ---

class TraceRenderer:
    """
    Decoupled renderer that enforces a specific theme, regardless of the
    Host Agent's current persona. This allows ODIN to view ALFRED traces
    in their native Cyan, without polluted by Odin's Red.
    """
    def __init__(self, target_persona: str):
        self.target_persona = target_persona
        # Temporarily switch global SovereignHUD persona to get theme colors
        self.original_persona = SovereignHUD.PERSONA
        SovereignHUD.PERSONA = target_persona
        self.theme = SovereignHUD._get_theme()
        SovereignHUD.PERSONA = self.original_persona # Restore

    def box_top(self, title: str) -> None:
        SovereignHUD.PERSONA = self.target_persona
        SovereignHUD.box_top(title)

    def box_row(self, label: str, value: Any, value_color: str = None, dim_label: bool = False) -> None:
        SovereignHUD.PERSONA = self.target_persona
        SovereignHUD.box_row(label, value, value_color, dim_label)

    def box_separator(self):
        SovereignHUD.PERSONA = self.target_persona
        SovereignHUD.box_separator()

    def box_bottom(self):
        SovereignHUD.PERSONA = self.target_persona
        SovereignHUD.box_bottom()

    def render_analysis(self, query, trigger, score, is_global, engine_instance=None):
        # Set Persona Context
        SovereignHUD.PERSONA = self.target_persona
        theme = SovereignHUD._get_theme()

        # Header
        print("\n")

        # Scanline Effect (Simulated)
        if self.target_persona in ["ODIN", "GOD"]:
             print(f"{theme['dim']}>> INITIATING WAR PROTOCOL...{SovereignHUD.RESET}")
        else:
             print(f"{theme['dim']}>> DECRYPTING LOG...{SovereignHUD.RESET}")

        self.box_top(theme["war_title"])

        self.box_row("Query", query, dim_label=True)

        # Score Color Logic (Relative to Theme)
        match_color = SovereignHUD.GREEN if score > 0.8 else SovereignHUD.YELLOW
        if self.target_persona in ["ODIN", "GOD"]:
             match_color = SovereignHUD.RED if score > 0.8 else SovereignHUD.YELLOW

        global_tag = f"{SovereignHUD.MAGENTA}[GLOBAL]{SovereignHUD.RESET} " if is_global else ""
        self.box_row(theme["trace_label"], f"{global_tag}{trigger}", match_color, dim_label=True)
        self.box_row("Confidence", f"{score:.4f}", match_color, dim_label=True)

        self.box_separator()

        # Forensics
        if engine_instance:
            q_tokens = engine_instance.expand_query(query)
            skill_text = engine_instance.skills.get(trigger, "")
            s_tokens = engine_instance.tokenize(skill_text)

            overlaps = []
            for qt, qw in q_tokens.items():
                if qt in s_tokens:
                    count = s_tokens.count(qt)
                    idf = engine_instance.idf.get(qt, 0)
                    overlaps.append((qt, qw, count, idf))
            overlaps.sort(key=lambda x: x[3], reverse=True)

            print(f"{theme['dim']}│{SovereignHUD.RESET} {theme['main']}{'TOKEN':<15} {'WEIGHT':<10} {'IDF':<10} {'SIGNAL'}{SovereignHUD.RESET}")

            for token, weight, count, idf in overlaps[:5]:
                signal_strength = weight * idf * math.log(1 + count)
                # Bar is always main theme color
                print(f"{theme['dim']}│{SovereignHUD.RESET} {token:<15} {weight:<10.2f} {idf:<10.2f} {theme['main']}{'█' * int(signal_strength * 2)}{SovereignHUD.RESET}")
        else:
            self.box_row("Status", "Offline (No Engine)", SovereignHUD.YELLOW)

        self.box_bottom()
        print("\n")

# --- MODES ---

def mode_live(query):
    engine = get_engine()
    results = engine.search(query)
    top_match = results[0] if results else None

    # Live always uses CURRENT Identity
    # Live always uses CURRENT Identity
    p = SovereignHUD.PERSONA
    renderer = TraceRenderer(p)

    trigger = top_match['trigger'] if top_match else "NONE"
    score = top_match['score'] if top_match else 0.0
    is_global = top_match.get('is_global', False)

    renderer.render_analysis(query, trigger, score, is_global, engine)

def mode_file(file_path):
    data = load_json(file_path)
    if not data:
        print(f"Failed to load trace: {file_path}")
        return

    # Identity Rendering: Respect the ORIGIN SOUL
    # Identity Rendering: Respect the ORIGIN SOUL
    stored_persona = data.get("persona", "ALFRED").upper()
    renderer = TraceRenderer(stored_persona)

    # Get Theme for message (temp switch)
    original = SovereignHUD.PERSONA
    SovereignHUD.PERSONA = stored_persona
    theme = SovereignHUD._get_theme()
    SovereignHUD.PERSONA = original # Restore

    print(f"{theme['dim']}>> REPLAYING ARTIFACT: {file_path} [{stored_persona}]{SovereignHUD.RESET}")

    engine = get_engine() # For token analysis

    renderer.render_analysis(
        data.get("query"),
        data.get("match", "UNKNOWN"),
        data.get("score", 0.0),
        data.get("is_global", False),
        engine
    )

def mode_war_room():
    # War Room is ODIN'S DOMAIN
    renderer = TraceRenderer("ODIN")
    SovereignHUD.PERSONA = "ODIN" # Enforce globally for direct log calls
    theme = SovereignHUD._get_theme()

    print("\n")
    renderer.box_top("⚔️  THE WAR ROOM  ⚔️")

    base_path = os.path.dirname(current_dir)
    traces_dir = os.path.join(base_path, "traces")
    trace_files = glob.glob(os.path.join(traces_dir, "*.json"))

    query_map = defaultdict(list)
    for tf in trace_files:
        t_data = load_json(tf)
        q = t_data.get("query")
        if q:
            t_data['_filename'] = os.path.basename(tf)
            query_map[q].append(t_data)

    conflicts = []
    print(f"{theme['dim']}>> SCANNING {len(trace_files)} SECTORS...{SovereignHUD.RESET}")

    for query, traces in query_map.items():
        matches = set()
        personas_involved = set()
        for t in traces:
            matches.add(t.get("match"))
            personas_involved.add(t.get("persona", "ALFRED"))

        if len(matches) > 1 and len(personas_involved) > 1:
            conflicts.append({
                "query": query,
                "factions": list(personas_involved),
                "outcomes": list(matches)
            })

    if not conflicts:
        renderer.box_row("STATUS", "PACIFIED", SovereignHUD.GREEN)
    else:
        renderer.box_row("STATUS", f"{len(conflicts)} ACTIVE CONFLICTS", SovereignHUD.RED)
        renderer.box_separator()

        print(f"{theme['dim']}│{SovereignHUD.RESET} {theme['main']}{'QUERY':<25} {'FACTIONS':<20} {'CONFLICTING OUTCOMES'}{SovereignHUD.RESET}")

        for c in conflicts:
            q_short = (c['query'][:22] + '..') if len(c['query']) > 22 else c['query']
            f_str = ",".join(c['factions'])
            o_str = " vs ".join([str(o) for o in c['outcomes']])
            print(f"{theme['dim']}│{SovereignHUD.RESET} {q_short:<25} {f_str:<20} {o_str}")

    renderer.box_bottom()
    print("\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Neural Trace Visualizer & War Room")
    parser.add_argument("query", nargs="?", help="The natural language query to visualize")
    parser.add_argument("--file", "-f", help="Path to a JSON trace file to replay")
    parser.add_argument("--war-room", "-w", action="store_true", help="Enter Conflict Analysis Mode")

    args = parser.parse_args()

    # Determine Mode
    if args.war_room:
        mode_war_room()
    elif args.file:
        mode_file(args.file)
    elif args.query:
        mode_live(args.query)
    else:
        parser.print_help()
