#!/usr/bin/env python3
"""
[ODIN] Identity Purity Audit (audit_dialogue.py)
Analyzes text for persona alignment using SovereignVector.
Encapsulated for the Linscott Standard.
"""

import argparse
import sys
from pathlib import Path

# Ensure src can be imported
PROJECT_ROOT = Path(__file__).parent.parent.parent.absolute()
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

# [ALFRED] Use standard imports from project root
from src.core.engine.dialogue import DialogueEngine
from src.core.sovereign_hud import SovereignHUD
from src.core.sv_engine import SovereignEngine


class DialogueAuditor:
    """
    Analyzes dialogue deviance against established Persona protocols.
    """

    def __init__(self, persona: str = "GOD") -> None:
        self.persona = persona
        self.project_root = PROJECT_ROOT
        self.base_path = self.project_root / ".agent"

        # Initialize Engine
        self.engine = SovereignEngine(self.project_root)

    def _resolve(self, root: Path, filename: str, subdir: str) -> Path:
        """Resolve path to a specific file within project structure."""
        return root / ".agent" / subdir / filename

    def audit(self, text: str) -> None:
        """Calculates and displays soul alignment score."""
        # Initialize SovereignHUD Dialogue
        voice_file = ("odin" if self.persona in ["GOD", "ODIN"] else "alfred") + ".qmd"
        dialogue_path = self._resolve(self.project_root, voice_file, "dialogue_db")

        # [ALFRED] Use DialogueEngine for context-aware audit
        SovereignHUD.DIALOGUE = DialogueEngine(str(dialogue_path))
        SovereignHUD.PERSONA = self.persona

        # Calculate purity
        score = self.engine.score_identity(text, self.persona)

        # Visual Output
        SovereignHUD.box_top("IDENTITY PURITY AUDIT")
        SovereignHUD.box_row("PERSONA", self.persona, SovereignHUD.MAGENTA)

        bar = SovereignHUD.progress_bar(score)
        color = SovereignHUD.GREEN if score > 0.4 else SovereignHUD.RED
        SovereignHUD.box_row("PURITY SCORE", f"{bar} {score:.2f}", color)

        if score > 0.4:
            msg = "SOUL ALIGNMENT: STABLE" if self.persona in ["GOD", "ODIN"] else "Fidelity check passed, sir."
            SovereignHUD.persona_log("SUCCESS", msg)
        else:
            msg = "DEVIANCE DETECTED. PURGE ENHANCED." if self.persona in ["GOD", "ODIN"] else "I'm concerned about our tone stability, sir."
            SovereignHUD.persona_log("FAIL", msg)

        SovereignHUD.box_bottom()


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit dialogue for persona alignment")
    parser.add_argument("text", help="Text to audit")
    parser.add_argument("--persona", default="GOD", help="Persona to audit against (GOD, ALFRED)")
    args = parser.parse_args()

    auditor = DialogueAuditor(persona=args.persona.upper())
    auditor.audit(args.text)


if __name__ == "__main__":
    main()
