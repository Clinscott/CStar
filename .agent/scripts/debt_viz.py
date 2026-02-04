#!/usr/bin/env python3
"""
Structural Debt Visualizer (debt_viz.py)
Uses Radon to map code complexity and identifies "War Zones".
"""

import os
import sys
import argparse
from typing import List, Dict, Any, Tuple

# Ensure we can import shared UI
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
try:
    from scripts.ui import HUD
except ImportError:
    # Fallback if not in the expected structure
    class HUD:
        RED = "\033[31m"
        YELLOW = "\033[33m"
        GREEN = "\033[32m"
        CYAN = "\033[36m"
        RESET = "\033[0m"
        BOLD = "\033[1m"
        DIM = "\033[2m"
        @staticmethod
        def box_top(t): print(t)
        @staticmethod
        def box_row(l, v, **k): print(f"{l}: {v}")
        @staticmethod
        def box_separator(): print("-" * 60)
        @staticmethod
        def box_bottom(): print("-" * 60)
        @staticmethod
        def log(lv, msg): print(f"[{lv}] {msg}")

try:
    from radon.complexity import cc_visit, cc_rank
    from radon.visitors import Function, Class
except ImportError:
    print("Error: 'radon' library not found. Run 'pip install radon'.")
    sys.exit(1)

# Configuration
IGNORE_DIRS = {".venv", ".git", "__pycache__", "mock_project", "node_modules", ".agent"}
HUD_WIDTH = 80

def get_python_files(root: str) -> List[str]:
    """Recursively finds all Python files, skipping ignored directories."""
    py_files = []
    for dirpath, dirnames, filenames in os.walk(root):
        # Filter dirnames in-place to skip ignored directories
        dirnames[:] = [d for d in dirnames if d not in IGNORE_DIRS]
        for f in filenames:
            if f.endswith(".py"):
                py_files.append(os.path.join(dirpath, f))
    return py_files

def analyze_complexity(files: List[str], log_errors: bool = True) -> Tuple[List[Dict[str, Any]], Dict[str, int], float]:
    """[ALFRED] Analyzes complexity with detailed error tracking for unparseable files."""
    all_blocks = []
    distribution = {"A": 0, "B": 0, "C": 0, "D": 0, "E": 0, "F": 0}
    total_cc = 0
    count = 0
    
    for f in files:
        try:
            with open(f, "r", encoding="utf-8") as file_content:
                code = file_content.read()
                blocks = cc_visit(code)
                for b in blocks:
                    rank = cc_rank(b.complexity)
                    distribution[rank] += 1
                    total_cc += b.complexity
                    count += 1
                    
                    # Store block info
                    all_blocks.append({
                        "file": os.path.relpath(f, os.getcwd()),
                        "name": b.name,
                        "type": "Class" if isinstance(b, Class) else "Func",
                        "cc": b.complexity,
                        "rank": rank,
                        "lineno": b.lineno
                    })
        except SyntaxError as e:
            if log_errors:
                HUD.log("WARN", "Parse Failure", f"{os.path.basename(f)} (Syntax Error)")
        except (IOError, PermissionError) as e:
            if log_errors:
                HUD.log("FAIL", "IO Error", f"{os.path.basename(f)} ({str(e)})")
        except Exception as e:
            if log_errors:
                HUD.log("WARN", "Complexity Error", f"{os.path.basename(f)} ({str(e)})")
            
    avg_cc = total_cc / count if count > 0 else 0
    return all_blocks, distribution, avg_cc

def render_dashboard(blocks: List[Dict[str, Any]], distribution: Dict[str, int], avg_cc: float, file_count: int):
    """Renders the HUD-styled complexity report."""
    os.environ["HUD_WIDTH"] = str(HUD_WIDTH)
    
    # Sort blocks by CC descending
    top_offenders = sorted(blocks, key=lambda x: x['cc'], reverse=True)[:10]
    
    avg_rank = cc_rank(int(avg_cc))
    avg_color = HUD.GREEN if avg_rank == 'A' else (HUD.YELLOW if avg_rank in ['B', 'C'] else HUD.RED)
    
    HUD.box_top("COMBAT ANALYSIS [RADON]")
    HUD.box_row("TARGET", os.getcwd())
    HUD.box_row("SCANNED", f"{file_count} Files")
    HUD.box_row("AVG COMPLEXITY", f"{avg_cc:.1f} ({avg_rank})", color=avg_color)
    HUD.box_separator()
    
    HUD.box_row("[WAR ZONES]", "TOP OFFENDERS", dim_label=True)
    for i, b in enumerate(top_offenders, 1):
        color = HUD.GREEN if b['rank'] == 'A' else (HUD.YELLOW if b['rank'] in ['B', 'C'] else HUD.RED)
        rank_str = f"[{b['rank']}]"
        label = f"{i}. {rank_str} {b['cc']:<3} {b['file']}"
        HUD.box_row(label[:20], f"{b['name']} ({b['type']})", color=color)
    
    HUD.box_separator()
    HUD.box_row("[DISTRIBUTION]", "CODEBASE SPREAD", dim_label=True)
    
    total_items = sum(distribution.values())
    if total_items > 0:
        for rank in ["A", "B", "C", "D", "E", "F"]:
            count = distribution[rank]
            perc = (count / total_items) * 100
            bar_len = int((perc / 100) * 30)
            bar = "█" * bar_len + "░" * (30 - bar_len)
            HUD.box_row(f"Rank {rank}", f"{bar} {perc:>3.0f}% ({count})")
            
    HUD.box_bottom()

def render_json(blocks: List[Dict[str, Any]], distribution: Dict[str, int], avg_cc: float):
    """Outputs the results in JSON format."""
    import json
    data = {
        "avg_complexity": avg_cc,
        "avg_rank": cc_rank(int(avg_cc)),
        "distribution": distribution,
        "blocks": blocks
    }
    print(json.dumps(data, indent=2))

def main():
    parser = argparse.ArgumentParser(description="Corvus Star Debt Visualizer")
    parser.add_argument("path", nargs="?", default=".", help="Path to scan (default: .)")
    parser.add_argument("--json", action="store_true", help="Output in JSON format")
    args = parser.parse_args()
    
    files = get_python_files(args.path)
    if not files:
        if args.json:
            print("{}")
        else:
            HUD.log("FAIL", "No Python files found for analysis.")
        return
        
    if not args.json:
        HUD.log("INFO", f"Scanning {len(files)} files for structural debt...")
        
    blocks, distribution, avg_cc = analyze_complexity(files)
    
    if not blocks:
        if args.json:
            print("{}")
        else:
            HUD.log("PASS", "Codebase is pristine. No blocks analyzed.")
        return
        
    if args.json:
        render_json(blocks, distribution, avg_cc)
    else:
        render_dashboard(blocks, distribution, avg_cc, len(files))

if __name__ == "__main__":
    main()
