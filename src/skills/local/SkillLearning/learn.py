#!/usr/bin/env python3
"""
[SKILL] SkillLearning
Mandate: ALFRED (Automated Logic & File Repository Evaluation Dashboard)
Purpose: Interactive dialogue for proactive skill acquisition.
"""

import sys
from pathlib import Path

# Add project root to path for shared imports
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

# [ALFRED] Ensure environment is initialized
try:
    from src.sentinel._bootstrap import SovereignBootstrap
    SovereignBootstrap.execute()
except (ImportError, ValueError, IndexError):
    pass

from src.core.sovereign_hud import SovereignHUD
from src.skills.local.SkillHunter.hunter import SkillHunter

class SkillLearner:
    """[ALFRED] Orchestration logic for interactive proactive skill acquisition."""

    @staticmethod
    def execute() -> None:
        """ALFRED Mandate: Proactive Learning."""
        SovereignHUD.PERSONA = "ALFRED"
        SovereignHUD.box_top("ALFRED MANDATE: PROACTIVE LEARNING")

        speak = "Master, I've noted a gap. Which technique shall I scry today?"
        SovereignHUD.persona_log("INFO", speak)

        prompt = (f"\n{SovereignHUD.CYAN}>> [A.L.F.R.E.D] "
                  f"Specify GitHub URL or Skill Name: {SovereignHUD.RESET}")
        
        # Note: input() is blocking but allowed in this diagnostic/cli context
        target = input(prompt).strip()

        if not target:
            SovereignHUD.persona_log("WARN", "Silence is a choice. Dismissed.")
            return

        # Check if it's a URL or a name
        if target.startswith("http"):
            url = target
            skill_name = target.split("/")[-1].replace(".git", "")
        else:
            skill_name = target
            SovereignHUD.persona_log("INFO", f"Searching void for '{skill_name}'...")
            url_prompt = (f"{SovereignHUD.CYAN}>> [A.L.F.R.E.D] "
                          f"I require the source for '{skill_name}': {SovereignHUD.RESET}")
            url = input(url_prompt).strip()
            if not url:
                SovereignHUD.persona_log("WARN", "Incomplete data. Cannot build.")
                return

        SovereignHUD.persona_log("INFO", f"Acquiring '{skill_name}' from {url}...")

        hunter = SkillHunter()
        hunter.ingest(url, skill_name)

        SovereignHUD.box_bottom()

if __name__ == "__main__":
    SkillLearner.execute()
