import sys
from pathlib import Path

from src.core.sovereign_hud import SovereignHUD

# Ensure root is in path
sys.path.append(str(Path(__file__).parent.parent.parent))

def test_hud_box():
    SovereignHUD.PERSONA = "ODIN"
    print("\n[TEST] Rendering ODIN Box:")
    SovereignHUD.box_top("ODIN VERIFICATION")
    SovereignHUD.box_row("Status", "Operational", color=SovereignHUD.GREEN)
    SovereignHUD.box_row("Breach", "None")
    SovereignHUD.box_bottom()

    SovereignHUD.PERSONA = "ALFRED"
    print("\n[TEST] Rendering ALFRED Box:")
    SovereignHUD.box_top("ALFRED VERIFICATION")
    SovereignHUD.box_row("Task", "Ravens Learning")
    SovereignHUD.box_row("Cycle", "5/20")
    SovereignHUD.box_bottom()

if __name__ == "__main__":
    test_hud_box()
