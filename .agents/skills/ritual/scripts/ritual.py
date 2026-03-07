import time
import sys
import argparse
import random
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.sovereign_hud import SovereignHUD

# [🔱] THE BARD'S GLYPHS
RUNES = ["ᚠ", "ᚢ", "th", "ᚩ", "ᚱ", "ᚴ", "ᚷ", "ᚹ", "ᚺ", "ᚾ", "ᛁ", "ᛃ", "ᛇ", "ᛈ", "ᛉ", "ᛋ", "ᛏ", "ᛒ", "ᛖ", "ᛗ", "ᛚ", "ᛝ", "ᛟ", "ᛞ"]

class RitualAesthetic:
    @staticmethod
    def awaken(agent="HUGINN"):
        print(f"\n[🔱] SUMMONING {agent}...")
        for _ in range(3):
            line = "".join(random.choices(RUNES, k=40))
            for char in line:
                sys.stdout.write(f"\033[35m{char}\033[0m")
                sys.stdout.flush()
                time.sleep(0.01)
            print()
        time.sleep(0.5)
        print(f"[ALFRED]: \"{agent} has opened his eyes, sir.\"")

    @staticmethod
    def render_path(path_list):
        print("\n ◤ PREDICTED FLIGHT PATH ◢")
        for i, skill in enumerate(path_list):
            arrow = "  ┃\n  ▼\n" if i < len(path_list) - 1 else ""
            color = "\033[32m" if i == 0 else "\033[36m"
            print(f"  {color}◈ {skill.upper()}\033[0m")
            if arrow: print(arrow)
        print()

    @staticmethod
    def pulse(message):
        frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
        for _ in range(10):
            for frame in frames:
                sys.stdout.write(f"\r\033[33m{frame}\033[0m {message}...")
                sys.stdout.flush()
                time.sleep(0.05)
        print("\r\033[32m✔\033[0m " + message + " [COMPLETE]")

def main():
    parser = argparse.ArgumentParser(description="Ritual: Aesthetic flair for the framework.")
    parser.add_argument("--awaken", help="Agent name to summon")
    parser.add_argument("--path", help="Comma-separated list of skills")
    parser.add_argument("--pulse", help="Pulse message")
    
    args = parser.parse_args()

    if args.awaken:
        RitualAesthetic.awaken(args.awaken.upper())
    elif args.path:
        RitualAesthetic.render_path(args.path.split(","))
    elif args.pulse:
        RitualAesthetic.pulse(args.pulse)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
