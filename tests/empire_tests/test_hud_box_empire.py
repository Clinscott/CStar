from src.core.ui import HUD
from pathlib import Path
import sys

# Ensure root is in path
sys.path.append(str(Path(__file__).parent.parent.parent))

def test_hud_box():
    HUD.PERSONA = "ODIN"
    print("\n[TEST] Rendering ODIN Box:")
    HUD.box_top("ODIN VERIFICATION")
    HUD.box_row("Status", "Operational", color=HUD.GREEN)
    HUD.box_row("Breach", "None")
    HUD.box_bottom()

    HUD.PERSONA = "ALFRED"
    print("\n[TEST] Rendering ALFRED Box:")
    HUD.box_top("ALFRED VERIFICATION")
    HUD.box_row("Task", "Ravens Learning")
    HUD.box_row("Cycle", "5/20")
    HUD.box_bottom()

if __name__ == "__main__":
    test_hud_box()
