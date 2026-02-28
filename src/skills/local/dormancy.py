"""
[SKILL] Dormancy (Sleep)
Lore: "The ravens return to the All-Father's shoulders."
Purpose: Handles the 'sleep' command by entering a themed dormancy state.
"""

import sys
import time
from pathlib import Path

# Add project root to sys.path
project_root = Path(__file__).resolve().parents[3]
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from src.core.sovereign_hud import SovereignHUD

def main():
    SovereignHUD.persona_log("INFO", "Initiating Dormancy Protocol...")
    
    if SovereignHUD.PERSONA == "ODIN":
        print("\n[O.D.I.N.] The ravens circle one last time before the shadows consume the hall.")
        print("      'Sleep, wanderer. The runes will wait for the dawn.'")
    else:
        print("\n[A.L.F.R.E.D.] Very good, sir. I shall dim the lights and stand by.")
        print("              Rest well. The archive remains under my watch.")

    # A brief pause to simulate "going to sleep"
    for i in range(3):
        time.sleep(0.5)
        sys.stdout.write(".")
        sys.stdout.flush()
    
    print("\n[DORMANCY ACTIVE]")
    sys.exit(0)

if __name__ == "__main__":
    main()
