import sys
import os
import json
from collections import defaultdict

# Import Shared UI
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from ui import HUD

def compile_report(project_root):
    HUD.box_top("SOVEREIGN CYCLE: FAILURE ANALYSIS")
    
    # Paths
    base_dir = os.path.join(project_root, ".agent")
    rej_path = os.path.join(base_dir, "traces", "quarantine", "REJECTIONS.md")
    
    rejections = []
    if os.path.exists(rej_path):
        with open(rej_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            for line in lines:
                if line.startswith("- ["):
                    rejections.append(line.strip())
    
    HUD.log("INFO", f"Found {len(rejections)} rejected traces in Quarantine.")
    
    # Categorize
    categories = defaultdict(int)
    for r in rejections:
        if "latency" in r.lower(): categories["LATENCY"] += 1
        elif "conflict" in r.lower(): categories["CONFLICT"] += 1
        elif "score" in r.lower(): categories["CONFIDENCE"] += 1
        else: categories["UNKNOWN"] += 1
        
    HUD.box_separator()
    HUD.box_row("CATEGORY", "COUNT", HUD.BOLD)
    for cat, count in categories.items():
        color = HUD.YELLOW
        if cat == "LATENCY": color = HUD.RED
        HUD.box_row(cat, str(count), color)
        
    HUD.box_bottom()

    # Recommendations
    if categories["LATENCY"] > 5:
        print(f"\n{HUD.RED}>> ADVISORY: Latency Spike Detected. Investigate network_watcher.py{HUD.RESET}")
    if categories["CONFLICT"] > 5:
        print(f"\n{HUD.YELLOW}>> ADVISORY: High Conflict Rate. Run 'python trace_viz.py --war-room'{HUD.RESET}")

if __name__ == "__main__":
    compile_report(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
