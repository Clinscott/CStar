"""
Code Sentinel - Structural Integrity Scanner powered by Ruff.
[Ω] HEIMDALL'S VIGIL / [ALFRED] THE PERIMETER
"""
import argparse
import json
import os
import subprocess
import sys

# Add script directory to path to allow imports from common script directory
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

try:
    from ui import HUD
except ImportError:
    # Minimal fallback if ui.py is not reachable or in-path
    class HUD:
        RED = "\033[31m"
        GREEN = "\033[32m"
        YELLOW = "\033[33m"
        CYAN = "\033[36m"
        RESET = "\033[0m"
        BOLD = "\033[1m"
        PERSONA = "ALFRED"
        @staticmethod
        def box_top(t): print(f"--- {t} ---")
        @staticmethod
        def box_row(l, v, c=None, d=False): print(f"{l}: {v}")
        @staticmethod
        def box_separator(): print("-" * 20)
        @staticmethod
        def box_bottom(): print("-" * 20)
        @staticmethod
        def _get_theme(): return {"main": "\033[36m", "dim": "\033[90m"}

def run_ruff(target: str = ".", fix: bool = False) -> list[dict]:
    """Execute ruff check and return parsed violations."""
    cmd = [sys.executable, "-m", "ruff", "check", target, "--output-format=json"]

    # Locate ruff.toml relative to this script
    script_parent = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    config_path = os.path.join(script_parent, "ruff.toml")

    if os.path.exists(config_path):
        cmd.extend(["--config", config_path])

    if fix:
        cmd.append("--fix")

    result = subprocess.run(cmd, capture_output=True, text=True)

    if not result.stdout.strip():
        return []

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return []

def format_results(violations: list[dict], target: str, fixed: bool = False) -> None:
    """Display violations with HUD theming."""
    theme = HUD._get_theme()
    title = "[Ω] HEIMDALL'S VIGIL (Sentinel)" if HUD.PERSONA == "ODIN" else "[ALFRED] THE PERIMETER SCAN"

    HUD.box_top(title)
    HUD.box_row("SCAN TARGET", target, HUD.CYAN)

    if fixed:
        HUD.box_row("ACTION", "REPAIR ATTEMPTED (--fix)", HUD.YELLOW)

    HUD.box_row("VIOLATIONS", str(len(violations)), HUD.RED if violations else HUD.GREEN)

    if violations:
        HUD.box_separator()
        # Cap at 15 for readability
        for v in violations[:15]:
            filename = os.path.basename(v['filename'])
            row = v['location']['row']
            col = v['location']['column']
            loc = f"{filename}:{row}:{col}"

            # Use color based on severity or persona
            color = HUD.RED if "Error" in v.get('severity', '') else HUD.YELLOW

            HUD.box_row(v['code'], f"{loc} - {v['message'][:50]}...", color, dim_label=True)

        if len(violations) > 15:
            HUD.box_row("...", f"+ {len(violations) - 15} more findings", dim_label=True)

    HUD.box_bottom()

def main():
    parser = argparse.ArgumentParser(description="Corvus Star Code Sentinel (Python Linter)")
    parser.add_argument("target", nargs="?", default=".", help="Target file or directory to scan")
    parser.add_argument("--fix", action="store_true", help="Attempt to automatically fix violations")
    parser.add_argument("--persona", choices=["ODIN", "ALFRED"], help="Override active persona")

    args = parser.parse_args()

    if args.persona:
        HUD.PERSONA = args.persona
    else:
        # Try to load from config.json
        script_parent = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # .agent
        config_path = os.path.join(script_parent, "config.json")
        if os.path.exists(config_path):
            try:
                with open(config_path) as f:
                    config = json.load(f)
                    HUD.PERSONA = config.get("Persona", "ALFRED").upper()
                    if HUD.PERSONA == "GOD": HUD.PERSONA = "ODIN"
            except:
                pass

    violations = run_ruff(args.target, args.fix)
    format_results(violations, args.target, args.fix)

if __name__ == "__main__":
    main()
