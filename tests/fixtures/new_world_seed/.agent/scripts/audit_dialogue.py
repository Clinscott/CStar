import argparse
import json
import os
import sys

# Add scripts dir to path for imports
scripts_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(scripts_dir)

import sv_engine


def run_audit(text_to_audit):
    # Initialize engine
    base_path = os.path.dirname(scripts_dir)
    project_root = os.path.dirname(base_path)

    # Load Config for persona
    config = {}
    config_path = os.path.join(base_path, "config.json")
    if os.path.exists(config_path):
        with open(config_path, encoding='utf-8') as f:
            config = json.load(f)

    persona_name = config.get("Persona", "ALFRED")

    # Setup engine with paths
    engine = sv_engine.SovereignVector(
        thesaurus_path=os.path.join(project_root, "thesaurus.md"),
        corrections_path=os.path.join(base_path, "corrections.json"),
        stopwords_path=os.path.join(scripts_dir, "stopwords.json")
    )

    # Initialize SovereignHUD Dialogue (needed for score_identity heuristic)
    voice_file = ("odin" if persona_name.upper() in ["GOD", "ODIN"] else "alfred") + ".md"
    dialogue_path = os.path.join(project_root, "dialogue_db", voice_file)
    sv_engine.SovereignHUD.DIALOGUE = sv_engine.DialogueRetriever(dialogue_path)
    sv_engine.SovereignHUD.PERSONA = persona_name.upper()

    # Calculate purity
    score = engine.score_identity(text_to_audit, persona_name)

    # Visual Output
    sv_engine.SovereignHUD.box_top("IDENTITY PURITY AUDIT")
    sv_engine.SovereignHUD.box_row("PERSONA", persona_name, sv_engine.SovereignHUD.MAGENTA)

    bar = sv_engine.SovereignHUD.progress_bar(score)
    color = sv_engine.SovereignHUD.GREEN if score > 0.4 else sv_engine.SovereignHUD.RED
    sv_engine.SovereignHUD.box_row("PURITY SCORE", f"{bar} {score:.2f}", color)

    if score > 0.4:
        msg = "SOUL ALIGNMENT: STABLE" if persona_name.upper() in ["GOD", "ODIN"] else "Fidelity check passed, sir."
    else:
        msg = "DEVIANCE DETECTED. RECALIBRATE." if persona_name.upper() in ["GOD", "ODIN"] else "Sir, I recommend adjusting our tone."

    sv_engine.SovereignHUD.box_row("VERDICT", msg, sv_engine.SovereignHUD.BOLD)
    sv_engine.SovereignHUD.box_bottom()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Neural Overwatch: Persona Purity Audit")
    parser.add_argument("text", nargs="*", help="Text to audit")
    parser.add_argument("--file", help="File to audit")
    args = parser.parse_args()

    input_text = ""
    if args.file and os.path.exists(args.file):
        with open(args.file, encoding='utf-8') as f:
            input_text = f.read()
    else:
        input_text = " ".join(args.text)

    if not input_text:
        print("Error: No text provided for audit.")
        sys.exit(1)

    run_audit(input_text)
