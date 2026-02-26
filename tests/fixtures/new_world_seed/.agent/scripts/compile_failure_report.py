import os
import sys
from collections import defaultdict

# Import Shared UI
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from src.core.sovereign_hud import SovereignHUD


def compile_report(project_root):
    SovereignHUD.box_top("SOVEREIGN CYCLE: FAILURE ANALYSIS")

    # Paths
    base_dir = os.path.join(project_root, ".agent")
    rej_path = os.path.join(base_dir, "traces", "quarantine", "REJECTIONS.md")

    rejections = []
    if os.path.exists(rej_path):
        with open(rej_path, encoding='utf-8') as f:
            lines = f.readlines()
            for line in lines:
                if line.startswith("- ["):
                    rejections.append(line.strip())

    SovereignHUD.log("INFO", f"Found {len(rejections)} rejected traces in Quarantine.")

    # Categorize
    categories = defaultdict(int)
    for r in rejections:
        if "latency" in r.lower(): categories["LATENCY"] += 1
        elif "conflict" in r.lower(): categories["CONFLICT"] += 1
        elif "score" in r.lower(): categories["CONFIDENCE"] += 1
        else: categories["UNKNOWN"] += 1

    SovereignHUD.box_separator()
    SovereignHUD.box_row("CATEGORY", "COUNT", SovereignHUD.BOLD)
    for cat, count in categories.items():
        color = SovereignHUD.YELLOW
        if cat == "LATENCY": color = SovereignHUD.RED
        SovereignHUD.box_row(cat, str(count), color)

    SovereignHUD.box_bottom()

    # Recommendations
    if categories["LATENCY"] > 5:
        print(f"\n{SovereignHUD.RED}>> ADVISORY: Latency Spike Detected. Investigate network_watcher.py{SovereignHUD.RESET}")
    if categories["CONFLICT"] > 5:
        print(f"\n{SovereignHUD.YELLOW}>> ADVISORY: High Conflict Rate. Run 'python trace_viz.py --war-room'{SovereignHUD.RESET}")

if __name__ == "__main__":
    compile_report(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
