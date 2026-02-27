#!/usr/bin/env python3
"""
[SKILL] SkillLearning
Mandate: ALFRED (Automated Logic & File Repository Evaluation Dashboard)
Purpose: Interactive dialogue for proactive skill acquisition.
"""

import os
import sys
from pathlib import Path

# Add project root to path
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from src.core.sovereign_hud import SovereignHUD
from src.skills.local.SkillHunter.hunter import SkillHunter


def learn_skill() -> None:
    """ALFRED Mandate: Proactive Learning."""
    SovereignHUD.PERSONA = "ALFRED"
    SovereignHUD.box_top("ALFRED MANDATE: PROACTIVE LEARNING")

    speak = "Master, I've noted a gap. Which technique shall I scry today?"
    SovereignHUD.persona_log("INFO", speak)

    prompt = (f"\n{SovereignHUD.CYAN}>> [A.L.F.R.E.D] "
              f"Specify GitHub URL or Skill Name: {SovereignHUD.RESET}")
    target = input(prompt).strip()

    if not target:
        SovereignHUD.persona_log("WARN", "Silence is a choice. Dismissed.")
        return

    # Check if it's a URL or a name
    if target.startswith("http"):
        url = target
        # Extract name from URL
        skill_name = target.split("/")[-1].replace(".git", "")
    else:
        # It's a name, search for it?
        skill_name = target
        SovereignHUD.persona_log("INFO", f"Searching void for '{skill_name}'...")
        # For now, we'll ask for the URL if it's just a name
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
    learn_skill()
