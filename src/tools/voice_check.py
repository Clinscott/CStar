import sys
from pathlib import Path

# Add src to path for absolute imports
sys.path.append(str(Path(__file__).parent.parent.parent))

from src.core.engine.dialogue import DialogueEngine
from src.core.ui import HUD

def main():
    hud = HUD()
    engine = DialogueEngine("src/data/dialogue/phrases.yaml")
    
    if len(sys.argv) < 3:
        hud.box_top("DIALOGUE VOICE CHECKER")
        hud.box_row("Usage: c* voice_check <persona> <intent> [tag1,tag2]")
        hud.box_row("Example: c* voice_check ALFRED ERROR_RECOVERY syntax")
        return

    persona = sys.argv[1].upper()
    intent = sys.argv[2].upper()
    tags = sys.argv[3].split(",") if len(sys.argv) > 3 else []
    
    context = {"error_type": tags[0]} if tags else {}
    
    hud.box_top(f"VOICE CHECK: {persona} [{intent}]")
    hud.box_row("Context Tags", f"{tags}")
    
    phrase = engine.get(persona, intent, context=context)
    hud.box_row("Result", f"{phrase}")
    hud.box_top("END DIAGNOSTIC")

if __name__ == "__main__":
    main()
