
"""
Skill Template
Identity: [PERSONA]
Purpose: [A brief description of the skill's goal]
"""
import sys
from pathlib import Path

# --- BOOTSTRAP: Align with Project Root ---
# This allows 'from src.core... import ...' to work reliably.
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.ui import HUD

def main():
    """Entry point for the skill."""
    HUD.transition_ceremony("TEMPLATE SKILL", "Initializing...")
    
    HUD.box_top("TEMPLATE PROTOCOL")
    HUD.box_row("Status", "Operational", HUD.GREEN)
    HUD.box_row("Note", "Copy this to .agent/skills/your_skill.py", HUD.DIM)
    HUD.box_bottom()
    
    # Your logic here...

if __name__ == "__main__":
    main()
