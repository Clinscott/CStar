#!/usr/bin/env python3
"""
[ODIN] Identity Purity Audit (audit_dialogue.py)
Analyzes text for persona alignment using SovereignVector.
Encapsulated for the Linscott Standard.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Optional

# Ensure sv_engine can be imported
scripts_dir = Path(__file__).parent.absolute()
if str(scripts_dir) not in sys.path:
    sys.path.append(str(scripts_dir))

import sv_engine


class DialogueAuditor:
    """
    Performs identity purity audits on text vs active persona.
    """

    def __init__(self):
        self.base_path = scripts_dir.parent
        self.project_root = self.base_path.parent
        self.config = self._load_config()
        self.persona = self.config.get("Persona", "ALFRED").upper()
        self.engine = self._init_engine()

    def _load_config(self) -> dict:
        config_path = self.base_path / "config.json"
        if config_path.exists():
            with config_path.open('r', encoding='utf-8') as f:
                return json.load(f)
        return {}

    def _resolve(self, root: Path, fname: str, subdir: str = "") -> Path:
        base = root / subdir if subdir else root
        qmd = base / fname.replace('.md', '.qmd')
        md = base / fname
        return qmd if qmd.exists() else md

    def _init_engine(self) -> sv_engine.SovereignVector:
        return sv_engine.SovereignVector(
            thesaurus_path=str(self._resolve(self.project_root, "thesaurus.qmd")),
            corrections_path=str(self.base_path / "corrections.json"),
            stopwords_path=str(scripts_dir / "stopwords.json")
        )

    def audit(self, text: str) -> None:
        """Calculates and displays soul alignment score."""
        # Initialize HUD Dialogue
        voice_file = ("odin" if self.persona in ["GOD", "ODIN"] else "alfred") + ".qmd"
        dialogue_path = self._resolve(self.project_root, voice_file, "dialogue_db")
        sv_engine.HUD.DIALOGUE = sv_engine.DialogueRetriever(str(dialogue_path))
        sv_engine.HUD.PERSONA = self.persona

        # Calculate purity
        score = self.engine.score_identity(text, self.persona)
        
        # Visual Output
        sv_engine.HUD.box_top("IDENTITY PURITY AUDIT")
        sv_engine.HUD.box_row("PERSONA", self.persona, sv_engine.HUD.MAGENTA)
        
        bar = sv_engine.HUD.progress_bar(score)
        color = sv_engine.HUD.GREEN if score > 0.4 else sv_engine.HUD.RED
        sv_engine.HUD.box_row("PURITY SCORE", f"{bar} {score:.2f}", color)
        
        if score > 0.4:
            msg = "SOUL ALIGNMENT: STABLE" if self.persona in ["GOD", "ODIN"] else "Fidelity check passed, sir."
        else:
            msg = "DEVIANCE DETECTED. RECALIBRATE." if self.persona in ["GOD", "ODIN"] else "Sir, I recommend adjusting our tone."
        
        sv_engine.HUD.box_row("VERDICT", msg, sv_engine.HUD.BOLD)
        sv_engine.HUD.box_bottom()


def main() -> None:
    """Entry point for the dialogue auditor."""
    parser = argparse.ArgumentParser(description="Neural Overwatch: Persona Purity Audit")
    parser.add_argument("text", nargs="*", help="Text to audit")
    parser.add_argument("--file", help="File to audit")
    args = parser.parse_args()

    input_text = ""
    if args.file:
        f_path = Path(args.file)
        if f_path.exists():
            with f_path.open('r', encoding='utf-8') as f:
                input_text = f.read()
    else:
        input_text = " ".join(args.text)

    if not input_text:
        print("Error: No text provided for audit.")
        sys.exit(1)

    auditor = DialogueAuditor()
    auditor.audit(input_text)


if __name__ == "__main__":
    main()
