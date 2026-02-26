import json
import os
import re
import sys

# Import Persona Logic
import personas

# Ensure UTF-8 output for Windows shells
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except: pass

# Import Shared UI
try:
    from src.core.sovereign_hud import SovereignHUD
except ImportError:
    # Fallback if run from different context without sys.path setup
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    from src.core.sovereign_hud import SovereignHUD

# PROPOSAL 1 & 3: IRON CORTEX
from engine import Cortex, DialogueRetriever, SovereignVector

if __name__ == "__main__":
    import argparse
    import time
    # Path Setup
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(script_dir))
    base_path = os.path.join(project_root, ".agent")

    # Load Config
    config = {}
    config_path = os.path.join(base_path, "config.json")

    # THRESHOLDS (SovereignFish Item 2)
    THRESHOLDS = {
        "REC": 0.5,
        "INSTALL": 0.85,
        "HANDSHAKE": 0.9,
        "ACCURACY": 0.8
    }

    if os.path.exists(config_path):
        try:
            with open(config_path, encoding='utf-8') as f:
                config = json.load(f)
        except: pass

    # Apply Persona Configuration
    persona_name = config.get("Persona", "ALFRED")
    SovereignHUD.PERSONA = persona_name.upper()

    # Initialize Strategies
    strategy = personas.get_strategy(persona_name, project_root)

    # Initialize Dialogue
    voice_file = strategy.get_voice() + ".md"
    dialogue_path = os.path.join(project_root, "dialogue_db", voice_file)
    SovereignHUD.DIALOGUE = DialogueRetriever(dialogue_path)

    # Argument Parsing
    parser = argparse.ArgumentParser(description="Corvus Star SovereignVector Engine")
    parser.add_argument("query", nargs="*", help="The natural language intent to analyze")
    parser.add_argument("--json", action="store_true", help="Output only JSON for Agent consumption")
    parser.add_argument("--record", action="store_true", help="Record this interaction as a trace")
    parser.add_argument("--benchmark", action="store_true", help="Health Check & performance report")
    # PROPOSAL 3: CORTEX
    parser.add_argument("--cortex", action="store_true", help="Query the Cortex (Knowledge Graph) instead of Skills")

    args = parser.parse_args()

    if args.benchmark:
        SovereignHUD.box_top("DIAGNOSTIC")
        SovereignHUD.box_row("ENGINE", "SovereignVector 2.5 (Iron Cortex)", SovereignHUD.CYAN)
        SovereignHUD.box_row("PERSONA", SovereignHUD.PERSONA, SovereignHUD.MAGENTA)
        SovereignHUD.box_row("ENCODING", sys.stdout.encoding, SovereignHUD.GREEN)
        SovereignHUD.box_bottom()
        sys.exit(0)

    query_text = " ".join(args.query)

    # Sanitize Query (SovereignFish Item 71)
    if query_text:
        # Strip potentially dangerous shell characters
        query_text = re.sub(r'[;&|`$(){}<>\\!]', '', query_text)
        # Collapse whitespace
        query_text = " ".join(query_text.split())

    # 3. CORTEX MODE
    if args.cortex and query_text:
        cortex = Cortex(project_root, base_path)
        results = cortex.query(query_text)

        SovereignHUD.box_top("CORTEX KNOWLEDGE QUERY")
        SovereignHUD.box_row("QUERY", query_text, SovereignHUD.BOLD)
        SovereignHUD.box_separator()

        if not results:
             SovereignHUD.box_row("RESULT", "NO DATA FOUND", SovereignHUD.RED)
        else:
            top = results[0]
            # Show top 3
            for r in results[:3]:
                score = r['score']
                color = SovereignHUD.GREEN if score > THRESHOLDS["REC"] else SovereignHUD.YELLOW
                SovereignHUD.box_row("SOURCE", r['trigger'], SovereignHUD.MAGENTA, dim_label=True)
                SovereignHUD.box_row("RELEVANCE", f"{score:.2f}", color, dim_label=True)
                SovereignHUD.box_separator()

        SovereignHUD.box_bottom()
        sys.exit(0)

    # 0. Enforce Operational Policy (Interactive Mode Only)
    if not query_text and not args.json:
        policy_results = strategy.enforce_policy()
        for res in policy_results:
            print(f"[{SovereignHUD.PERSONA}] {res}")

    # Initialize Engine (Normal Mode)
    engine = SovereignVector(
        thesaurus_path=os.path.join(project_root, "thesaurus.md"),
        corrections_path=os.path.join(base_path, "corrections.json"),
        stopwords_path=os.path.join(base_path, "scripts", "stopwords.json")
    )

    # 1. Load Core & Local Skills
    engine.load_core_skills()
    engine.load_skills_from_dir(os.path.join(base_path, "skills"))

    # Load Global Skills (Mimir's Eye)
    knowledge_core = config.get("KnowledgeCore")
    if knowledge_core:
        if not os.path.exists(knowledge_core):
            if SovereignHUD.PERSONA == "ODIN":
                 print(f"{SovereignHUD._get_theme()['dim']}>> [Ω] WARNING: Mimir's Eye is blind. Path not found: {knowledge_core}{SovereignHUD.RESET}")
            else:
                 print(f"{SovereignHUD._get_theme()['dim']}>> [C*] Briefing: Knowledge Core unreachable at {knowledge_core}{SovereignHUD.RESET}")
        else:
            global_path = os.path.join(knowledge_core, "skills")
            if os.path.exists(global_path):
                engine.load_skills_from_dir(global_path, prefix="GLOBAL:")
    elif config.get("FrameworkRoot"):
         # Fallback to legacy
         global_path = os.path.join(config.get("FrameworkRoot"), "skills_db")
         if os.path.exists(global_path):
            engine.load_skills_from_dir(global_path, prefix="GLOBAL:")

    engine.build_index()

    if query_text:
        results = engine.search(query_text)

        # Tiered Output Integration
        top_match = results[0] if results else None
        recommendations = [r for r in results if r['is_global'] and r['score'] > THRESHOLDS["REC"]]

        propose_install = None
        if top_match and top_match['is_global'] and top_match['score'] > THRESHOLDS["INSTALL"]:
            skill_name = top_match['trigger'].replace("GLOBAL:", "")
            # Windows/PowerShell specific command
            propose_install = f"powershell -Command \"& {{ python .agent/scripts/install_skill.py {skill_name} }}\""

        # Trace Recording (Normal Mode Only)
        if args.record and top_match:
            traces_dir = os.path.join(base_path, "traces")
            if not os.path.exists(traces_dir): os.makedirs(traces_dir)

            trace_id = re.sub(r'\W+', '_', query_text[:20]) + f"_{top_match['score']:.2f}"
            trace_path = os.path.join(traces_dir, f"{trace_id}.json")

            trace_data = {
                "query": query_text,
                "match": top_match['trigger'],
                "score": top_match['score'],
                "is_global": top_match['is_global'],
                "persona": SovereignHUD.PERSONA,
                "timestamp": config.get("version", "unknown")
            }
            with open(trace_path, "w", encoding='utf-8') as f:
                json.dump(trace_data, f, indent=2)

        trace = {
            "query": query_text,
            "top_match": top_match,
            "propose_immediate_install": propose_install,
            "recommendation_report": recommendations if not propose_install else []
        }

        # JSON Output (Pure Data)
        if args.json:
            print(json.dumps(trace, indent=2))
            sys.exit(0)

        # --- SCI-FI TERMINAL UI ---

        # Neural Handshake Animation
        if top_match and top_match['score'] > THRESHOLDS["HANDSHAKE"]:
            theme = SovereignHUD._get_theme()
            print(f"{theme['dim']}>> ESTABLISHING ROBUST LINK...{SovereignHUD.RESET}", end="\r")
            time.sleep(0.3)
            print(f"{theme['main']}>> LINK ESTABLISHED           {SovereignHUD.RESET}")

        SovereignHUD.box_top()

        intent_label = "COMMAND" if SovereignHUD.PERSONA == "ODIN" else "User Intent"
        SovereignHUD.box_row(intent_label, query_text, SovereignHUD.BOLD)

        if top_match:
            score = top_match['score']
            score_color = SovereignHUD.GREEN if score > THRESHOLDS["ACCURACY"] else SovereignHUD.YELLOW
            if SovereignHUD.PERSONA == "ODIN": score_color = SovereignHUD.RED if score > THRESHOLDS["ACCURACY"] else SovereignHUD.YELLOW

            is_global = f"{SovereignHUD.MAGENTA}[GLOBAL]{SovereignHUD.RESET} " if top_match['is_global'] else ""

            bar = SovereignHUD.progress_bar(score)
            match_label = "ENTITY DETECTED" if SovereignHUD.PERSONA == "ODIN" else "Match"
            conf_label = "PROBABILITY" if SovereignHUD.PERSONA == "ODIN" else "Confidence"

            SovereignHUD.box_row(match_label, f"{is_global}{top_match['trigger']}", dim_label=True)
            SovereignHUD.box_row(conf_label, f"{bar} {score:.2f}", score_color, dim_label=True)

        if propose_install:
            SovereignHUD.box_separator()
            skill_short = skill_name if 'skill_name' in locals() else ""
            if SovereignHUD.PERSONA == "ODIN":
                SovereignHUD.box_row("⚠️  MANDATE", "CAPABILITY REQUIRED", SovereignHUD.RED)
                SovereignHUD.box_row("EXECUTION", f"Install {skill_short}", SovereignHUD.RED)
            else:
                SovereignHUD.box_row("⚠️  PROACTIVE", SovereignHUD._speak("SEARCH_SUCCESS", "Handshake Detected"), SovereignHUD.YELLOW)
                SovereignHUD.box_row("Suggestion", f"Install {skill_short}", SovereignHUD.GREEN)

            SovereignHUD.box_bottom()
            try:
                sys.stdout.flush()
                prompt = ""
                if SovereignHUD.PERSONA == "ODIN":
                    prompt = f"\n{SovereignHUD.RED}>> [Ω] {SovereignHUD._speak('PROACTIVE_INSTALL', 'AUTHORIZE DEPLOYMENT?')} [Y/n] {SovereignHUD.RESET}"
                else:
                    prompt = f"\n{SovereignHUD.CYAN}>> [C*] {SovereignHUD._speak('PROACTIVE_INSTALL', 'Would you like to install this?')} [Y/n] {SovereignHUD.RESET}"

                choice = input(prompt).strip().lower()

                if choice in ['', 'y', 'yes']:
                    if SovereignHUD.PERSONA == "ODIN":
                        print(f"\n{SovereignHUD.RED}>> COMMAND ACCEPTED.{SovereignHUD.RESET} ENFORCING...")
                    else:
                        print(f"\n{SovereignHUD.GREEN}>> ACCEL{SovereignHUD.RESET} Initiating deployment sequence...")

                    import subprocess
                    subprocess.run(["powershell", "-Command", f"& {{ python .agent/scripts/install_skill.py {skill_short} }}"], check=False)
                else:
                    msg = "DISSENT RECORDED" if "ODIN" in SovereignHUD.PERSONA else "ABORT"
                    color = SovereignHUD.YELLOW
                    print(f"\n{color}>> {msg}.{SovereignHUD.RESET}")
            except (EOFError, KeyboardInterrupt):
                pass

            sys.exit(0)
        elif recommendations:
            SovereignHUD.box_separator()
            rec_label = "ALTERNATE REALITIES" if SovereignHUD.PERSONA == "ODIN" else "Discovery"
            for rec in recommendations[:2]:
               SovereignHUD.box_row(rec_label, f"{rec['trigger']} ({rec['score']:.2f})", SovereignHUD.MAGENTA)

        SovereignHUD.box_bottom()
