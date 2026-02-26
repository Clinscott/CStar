#!/usr/bin/env python3
"""
[ALFRED] The Archive Consolidator
Identity: ALFRED
Purpose: Tech-Debt Analysis & Target Isolation.

Analyzes the history (Git churn) and current coverage, identifying weak points 
by cross-referencing Complexity + Churn + Coverage.

Outputs the top priority targets to .agent/tech_debt_ledger.json.
"""

import argparse
import ast
import json
import logging
import subprocess
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

# Ensure UTF-8 output for box-drawing characters
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding='utf-8')

project_root = Path(__file__).parent.parent.parent.absolute()
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.core.sovereign_hud import SovereignHUD

# Configure Logging
logging.basicConfig(
    filename=str(project_root / "sovereign_activity.log"),
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)

# Optional dependency: radon for cyclomatic complexity
try:
    from radon.complexity import cc_visit
    def get_complexity(source_code: str) -> float:
        """Calculate average cyclomatic complexity using radon."""
        try:
            blocks = cc_visit(source_code)
            if not blocks:
                return 1.0 # Baseline
            return sum(b.complexity for b in blocks) / len(blocks)
        except Exception:
            return 1.0
except ImportError:
    # AST Fallback if radon is not available
    def get_complexity(source_code: str) -> float:
        """Fallback: Calculate complexity by counting branching AST nodes."""
        try:
            tree = ast.parse(source_code)
            complexity = 1
            for node in ast.walk(tree):
                if isinstance(node, (ast.If, ast.IfExp, ast.For, ast.While,
                                     ast.Try, ast.ExceptHandler, ast.With, ast.Match)):
                    complexity += 1
                elif isinstance(node, ast.BoolOp) and isinstance(node.op, (ast.And, ast.Or)):
                    complexity += len(node.values) - 1
            return float(complexity)
        except Exception:
            return 1.0


class ArchiveConsolidator:
    """
    Analyzes project health by combining Git Churn, Complexity, and Test Coverage.
    Outputs a Risk Score to isolate technical debt targets.
    """

    def __init__(self, target_dir: str = ".", days: int = 30):
        self.target_dir = Path(target_dir).resolve()
        self.days = days
        self.ledger_path = project_root / ".agent" / "tech_debt_ledger.json"

        # Enforce ALFRED persona for this tool
        SovereignHUD.PERSONA = "ALFRED"

    def _get_git_churn(self) -> dict[str, int]:
        """Calculates line churn for files changed in the last N days."""
        churn_data = defaultdict(int)

        try:
            cmd = ["git", "log", f"--since={self.days}.days", "--oneline", "--numstat"]
            result = subprocess.run(cmd, cwd=str(self.target_dir), capture_output=True, text=True, check=True)

            if result.stdout:
                for line in result.stdout.splitlines():
                    parts = line.split('\t')
                    if len(parts) == 3:
                        additions = parts[0]
                        deletions = parts[1]
                        filepath = parts[2]

                        if additions == "-" or deletions == "-":
                            continue # Binary file

                        churn_data[filepath] += int(additions) + int(deletions)

        except (subprocess.CalledProcessError, FileNotFoundError):
            SovereignHUD.persona_log("WARN", "Git churn calculation failed. Returning empty data.")

        return dict(churn_data)

    def _has_test_coverage(self, filepath: str) -> bool:
        """Checks if a corresponding test file exists."""
        source_path = Path(filepath)
        if not source_path.name.endswith(".py"):
            return True # Ignore non-python for now

        test_filename = f"test_{source_path.name}"
        search_dirs = [
            project_root / "tests",
            project_root / "tests" / "unit",
            project_root / "tests" / "integration",
            project_root / "tests" / "empire_tests"
        ]

        for sd in search_dirs:
            if sd.exists():
                for test_file in sd.rglob(test_filename):
                    return True
        return False

    def analyze(self) -> list[dict[str, Any]]:
        """Performs the full consolidation analysis."""
        SovereignHUD.box_top("[A] THE ARCHIVE CONSOLIDATOR")
        SovereignHUD.box_row("TARGET", str(self.target_dir), SovereignHUD.CYAN)
        SovereignHUD.box_row("CHURN WINDOW", f"Last {self.days} days", SovereignHUD.CYAN)
        SovereignHUD.box_separator()

        SovereignHUD.persona_log("INFO", "Gathering Git churn statistics...")
        churn_data = self._get_git_churn()
        SovereignHUD.box_row("FILES MODIFIED", str(len(churn_data)), SovereignHUD.GREEN)

        target_files = []
        SovereignHUD.persona_log("INFO", "Evaluating complexity and coverage matrix...")

        for rel_path, churn in churn_data.items():
            if not rel_path.endswith('.py'):
                continue

            full_path = self.target_dir / rel_path
            if not full_path.exists() or not full_path.is_file():
                continue

            try:
                code = full_path.read_text(encoding='utf-8')
                complexity = get_complexity(code)
                has_test = self._has_test_coverage(rel_path)

                # The "Risk Score" Algorithm
                # High churn multiplies complexity. Low coverage acts as a huge multiplier.
                coverage_multiplier = 1.0 if has_test else 3.0
                # Normalize churn slightly to prevent massive files from dwarfing everything
                normalized_churn = min(churn / 100.0, 10.0) + 1.0

                risk_score = (complexity * normalized_churn) * coverage_multiplier

                target_files.append({
                    "file": str(full_path.relative_to(project_root)),
                    "churn": churn,
                    "complexity": round(complexity, 2),
                    "coverage": has_test,
                    "risk_score": round(risk_score, 2)
                })
            except Exception as e:
                logging.warning(f"Failed to analyze {rel_path}: {e}")

        # Sort by risk score, descending
        target_files.sort(key=lambda x: x["risk_score"], reverse=True)

        self._write_ledger(target_files)
        self._render_report(target_files)

        return target_files

    def _write_ledger(self, targets: list[dict[str, Any]]) -> None:
        """Writes the prioritized targets to the ledger."""
        self.ledger_path.parent.mkdir(parents=True, exist_ok=True)

        ledger_data = {
            "timestamp": SovereignHUD._speak("timestamp", "Now"), # Standard timestamp fallback
            "top_targets": targets[:20] # Keep top 20
        }

        self.ledger_path.write_text(json.dumps(ledger_data, indent=4), encoding='utf-8')

    def _render_report(self, targets: list[dict[str, Any]]) -> None:
        """Displays the high-risk targets in the SovereignHUD."""
        SovereignHUD.box_separator()
        SovereignHUD.box_row("TOP SECURITY TARGETS (RISK SCORE)", "CHURN | CC | TEST COV", SovereignHUD.RED)
        SovereignHUD.box_separator()

        if not targets:
            SovereignHUD.box_row("STATUS", "The archive is immaculate, sir.", SovereignHUD.GREEN)
        else:
            for idx, item in enumerate(targets[:10], start=1):
                f_name = Path(item['file']).name
                color = SovereignHUD.RED if not item['coverage'] else SovereignHUD.YELLOW
                cov_mark = "[OK]" if item['coverage'] else "[MISSING]"
                stats = f"{item['churn']:<5} | {item['complexity']:<4} | {cov_mark}"

                # Format: 1.  filename.py ... 142 | 5.2 | [MISSING]
                SovereignHUD.box_row(f"{idx:02d}. {f_name}", stats, color, dim_label=True)

            if len(targets) > 10:
                SovereignHUD.box_row("...", f"+ {len(targets) - 10} more files analyzed", dim_label=True)

        SovereignHUD.box_bottom()


def main():
    parser = argparse.ArgumentParser(description="The Archive Consolidator - Tech Debt Analysis")
    parser.add_argument("target", nargs="?", default=".", help="Target directory to scan")
    parser.add_argument("--days", type=int, default=30, help="Days of git history to analyze")
    args = parser.parse_args()

    consolidator = ArchiveConsolidator(target_dir=args.target, days=args.days)
    try:
        consolidator.analyze()
        return 0
    except KeyboardInterrupt:
        SovereignHUD.persona_log("WARN", "Consolidation aborted by user.")
        return 1
    except Exception as e:
        SovereignHUD.persona_log("ERROR", f"Consolidation failed: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
