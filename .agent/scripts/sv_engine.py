import json
import os
import sys
import re
import personas
import utils
from ui import HUD
from engine import SovereignVector, DialogueRetriever, Cortex

# Configuration Constants
THRESHOLDS = {"REC": 0.5, "INSTALL": 0.85, "HANDSHAKE": 0.9, "ACCURACY": 0.8}

def handle_cortex_query(query: str, project_root: str, base_path: str):
    """Execution path for Knowledge Graph (Cortex) queries."""
    cortex = Cortex(project_root, base_path)
    results = cortex.query(query)
    HUD.box_top("CORTEX KNOWLEDGE QUERY")
    HUD.box_row("QUERY", query, HUD.BOLD)
    HUD.box_separator()
    if not results: HUD.box_row("RESULT", "NO DATA FOUND", HUD.RED)
    else:
        for r in results[:3]:
            color = HUD.GREEN if r['score'] > THRESHOLDS["REC"] else HUD.YELLOW
            HUD.box_row("SOURCE", r['trigger'], HUD.MAGENTA, dim_label=True)
            HUD.box_row("RELEVANCE", f"{r['score']:.2f}", color, dim_label=True)
            HUD.box_separator()
    HUD.box_bottom()
    sys.exit(0)

def record_trace(query: str, match: dict, base_path: str, config: dict):
    """Persistence for neural interaction traces."""
    tdir = os.path.join(base_path, "traces")
    os.makedirs(tdir, exist_ok=True)
    tid = re.sub(r'\W+', '_', query[:20]) + f"_{match['score']:.2f}"
    with open(os.path.join(tdir, f"{tid}.json"), "w", encoding='utf-8') as f:
        json.dump({"query": query, "match": match['trigger'], "score": match['score'], 
                   "is_global": match['is_global'], "persona": HUD.PERSONA, 
                   "timestamp": config.get("version", "unknown")}, f, indent=2)

def main():
    import argparse
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(script_dir))
    base_path = os.path.join(project_root, ".agent")
    config = utils.load_config(project_root)

    # Persona & Strategy Init
    HUD.PERSONA = config.get("Persona", "ALFRED").upper()
    strategy = personas.get_strategy(HUD.PERSONA, project_root)
    HUD.DIALOGUE = DialogueRetriever(os.path.join(project_root, "dialogue_db", strategy.get_voice() + ".md"))

    p = argparse.ArgumentParser()
    p.add_argument("query", nargs="*"), p.add_argument("--json", action="store_true")
    p.add_argument("--record", action="store_true"), p.add_argument("--benchmark", action="store_true")
    p.add_argument("--cortex", action="store_true")
    args = p.parse_args()

    if args.benchmark:
        HUD.box_top("DIAGNOSTIC")
        HUD.box_row("ENGINE", "SovereignVector 2.5 (Iron Cortex)", HUD.CYAN)
        HUD.box_row("PERSONA", HUD.PERSONA, HUD.MAGENTA)
        HUD.box_bottom(); sys.exit(0)

    query = utils.sanitize_query(" ".join(args.query))
    if args.cortex and query: handle_cortex_query(query, project_root, base_path)
    if not query and not args.json: 
        for res in strategy.enforce_policy(): print(f"[{HUD.PERSONA}] {res}")

    # Engine Execution
    engine = SovereignVector(os.path.join(project_root, "thesaurus.md"), os.path.join(base_path, "corrections.json"))
    engine.load_core_skills()
    engine.load_skills_from_dir(os.path.join(base_path, "skills"))
    
    # Load Remote Knowledge
    remote_path = config.get("KnowledgeCore") or os.path.join(config.get("FrameworkRoot", ""), "skills_db")
    if remote_path and os.path.exists(remote_path):
        engine.load_skills_from_dir(os.path.join(remote_path, "skills") if "KnowledgeCores" in str(remote_path) else remote_path, prefix="GLOBAL:")
    
    engine.build_index()
    if not query: sys.exit(0)

    results = engine.search(query)
    top = results[0] if results else None
    if args.record and top: record_trace(query, top, base_path, config)

    if args.json:
        print(json.dumps({"query": query, "top_match": top}, indent=2)); sys.exit(0)

    # UI Rendering
    HUD.box_top()
    HUD.box_row("COMMAND" if HUD.PERSONA == "ODIN" else "Intent", query, HUD.BOLD)
    if top:
        color = HUD.GREEN if top['score'] > THRESHOLDS["ACCURACY"] else HUD.YELLOW
        HUD.box_row("Match", f"{'[G] ' if top['is_global'] else ''}{top['trigger']}", HUD.DIM)
        HUD.box_row("Confidence", f"{HUD.progress_bar(top['score'])} {top['score']:.2f}", color)

    # JIT Installation Flow
    if top and top['is_global'] and top['score'] > THRESHOLDS["INSTALL"]:
        s_name = top['trigger'].replace("GLOBAL:", "")
        HUD.box_separator()
        HUD.box_row("PROACTIVE", f"Install {s_name}?", HUD.CYAN)
        HUD.box_bottom()
        prompt = f"\n{HUD.CYAN}>> [C*] {HUD._speak('PROACTIVE_INSTALL', 'Install skill?')} [Y/n] {HUD.RESET}"
        if utils.input_with_timeout(prompt) in ['', 'y', 'yes']:
            subprocess.run([sys.executable, os.path.join(script_dir, "install_skill.py"), s_name])
    HUD.box_bottom()

if __name__ == "__main__": main()
