#!/usr/bin/env python3
"""
[ODIN] Structural Debt Visualizer (debt_viz.py)
Uses Radon to map code complexity and identifies "War Zones".
Strictly encapsulated for the Linscott Standard (Pathlib).
"""

import argparse
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Ensure we can import shared UI
sys.path.append(str(Path(__file__).parent.parent))
try:
    from scripts.ui import HUD
except ImportError:
    # Fallback if not in the expected structure
    class HUD:
        RED = "\033[31m"; YELLOW = "\033[33m"; GREEN = "\033[32m"
        CYAN = "\033[36m"; RESET = "\033[0m"; BOLD = "\033[1m"; DIM = "\033[2m"
        @staticmethod
        def box_top(t): print(t)
        @staticmethod
        def box_row(l, v, **k): print(f"{l}: {v}")
        @staticmethod
        def box_separator(): print("-" * 60)
        @staticmethod
        def box_bottom(): print("-" * 60)
        @staticmethod
        def log(lv, msg, d=""): print(f"[{lv}] {msg} {d}")

try:
    from radon.complexity import cc_rank, cc_visit
    from radon.visitors import Class as RadonClass
    from radon.visitors import Function as RadonFunction
except ImportError:
    HUD.log("FAIL", "Radon library not found.", "Run 'pip install radon'")
    sys.exit(1)


class DebtAnalyzer:
    """
    Orchestrates complexity analysis and reporting.
    """

    IGNORE_DIRS = {".venv", ".git", "__pycache__", "mock_project", "node_modules"}
    HUD_WIDTH = 80

    def __init__(self, root_path: str = "."):
        self.root_path = Path(root_path).absolute()
        self.files: List[Path] = []
        self.blocks: List[Dict[str, Any]] = []
        self.distribution: Dict[str, int] = {"A": 0, "B": 0, "C": 0, "D": 0, "E": 0, "F": 0}
        self.avg_cc: float = 0.0

    def _get_python_files(self) -> None:
        """Recursively finds all Python files, skipping ignored directories."""
        self.files = []
        for py_file in self.root_path.rglob("*.py"):
            # Check if any part of the path is in IGNORE_DIRS
            if any(part in self.IGNORE_DIRS for part in py_file.parts):
                continue
            self.files.append(py_file)

    def analyze(self, log_errors: bool = True) -> bool:
        """Performs Radon complexity visit on all discovered files."""
        self._get_python_files()
        if not self.files:
            return False

        total_cc = 0
        count = 0
        cwd = Path.cwd()
        
        for f in self.files:
            try:
                with f.open("r", encoding="utf-8") as file_content:
                    code = file_content.read()
                    radon_blocks = cc_visit(code)
                    for b in radon_blocks:
                        rank = cc_rank(b.complexity)
                        self.distribution[rank] += 1
                        total_cc += b.complexity
                        count += 1
                        
                        try:
                            rel_file = str(f.relative_to(cwd))
                        except ValueError:
                            rel_file = str(f)

                        self.blocks.append({
                            "file": rel_file,
                            "name": b.name,
                            "type": "Class" if isinstance(b, RadonClass) else "Func",
                            "cc": b.complexity,
                            "rank": rank,
                            "lineno": b.lineno
                        })
            except SyntaxError:
                if log_errors:
                    HUD.log("WARN", "Parse Failure", f.name)
            except (IOError, PermissionError) as e:
                if log_errors:
                    HUD.log("FAIL", "IO Error", f"{f.name} ({str(e)})")
            except Exception as e:
                if log_errors:
                    HUD.log("WARN", "Complexity Error", f"{f.name} ({str(e)})")
                
        self.avg_cc = total_cc / count if count > 0 else 0
        return len(self.blocks) > 0

    def render_json(self) -> None:
        """Outputs the results in JSON format."""
        import json
        data = {
            "avg_complexity": self.avg_cc,
            "avg_rank": cc_rank(int(self.avg_cc)) if self.avg_cc > 0 else "A",
            "distribution": self.distribution,
            "blocks": self.blocks
        }
        print(json.dumps(data, indent=2))

    def render_dashboard(self) -> None:
        """Renders the HUD-styled complexity report."""
        os.environ["HUD_WIDTH"] = str(self.HUD_WIDTH)
        
        # Sort blocks by CC descending
        top_offenders = sorted(self.blocks, key=lambda x: x['cc'], reverse=True)[:10]
        
        avg_rank = cc_rank(int(self.avg_cc)) if self.avg_cc > 0 else "A"
        avg_color = HUD.GREEN if avg_rank == 'A' else (HUD.YELLOW if avg_rank in ['B', 'C'] else HUD.RED)
        
        HUD.box_top("COMBAT ANALYSIS [RADON]")
        HUD.box_row("TARGET", str(self.root_path))
        HUD.box_row("SCANNED", f"{len(self.files)} Files")
        HUD.box_row("AVG COMPLEXITY", f"{self.avg_cc:.1f} ({avg_rank})", color=avg_color)
        HUD.box_separator()
        
        HUD.box_row("[WAR ZONES]", "TOP OFFENDERS", dim_label=True)
        for i, b in enumerate(top_offenders, 1):
            color = HUD.GREEN if b['rank'] == 'A' else (HUD.YELLOW if b['rank'] in ['B', 'C'] else HUD.RED)
            rank_str = f"[{b['rank']}]"
            label = f"{i}. {rank_str} {b['cc']:<3} {b['file']}"
            HUD.box_row(label[:24], f"{b['name']} ({b['type']})", color=color)
        
        HUD.box_separator()
        HUD.box_row("[DISTRIBUTION]", "CODEBASE SPREAD", dim_label=True)
        
        total_items = sum(self.distribution.values())
        if total_items > 0:
            for rank in ["A", "B", "C", "D", "E", "F"]:
                count = self.distribution[rank]
                perc = (count / total_items) * 100
                bar_len = int((perc / 100) * 30)
                bar = "█" * bar_len + "░" * (30 - bar_len)
                HUD.box_row(f"Rank {rank}", f"{bar} {perc:>3.0f}% ({count})")
                
        HUD.box_bottom()


def main() -> None:
    """Entry point for the debt visualizer."""
    parser = argparse.ArgumentParser(description="Corvus Star Debt Visualizer")
    parser.add_argument("path", nargs="?", default=".", help="Path to scan (default: .)")
    parser.add_argument("--json", action="store_true", help="Output in JSON format")
    args = parser.parse_args()
    
    analyzer = DebtAnalyzer(args.path)
    if not analyzer.analyze():
        if args.json:
            print("{}")
        else:
            HUD.log("FAIL", "No parseable Python blocks found.")
        return

    if args.json:
        analyzer.render_json()
    else:
        analyzer.render_dashboard()


if __name__ == "__main__":
    main()
