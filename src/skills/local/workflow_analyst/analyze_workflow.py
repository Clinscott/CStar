#!/usr/bin/env python3
"""
[SKILL] Workflow Analyst
Lore: "Untangling the threads of fate."
Purpose: Analyzes tasks and journals for stalled items and recurring patterns.
"""

import json
import re
from collections import Counter
from pathlib import Path
from typing import Any


class WorkflowAnalyst:
    """
    Analyzes project workflow files (tasks.md, dev_journal.md) for actionable insights.
    """
    def __init__(self, root_dir: str | Path) -> None:
        """
        Initializes the analyst with the project root.
        
        Args:
            root_dir: Path to the project root.
        """
        self.root = Path(root_dir)
        self.tasks_path = self.root / "tasks.md"
        self.journal_path = self.root / "dev_journal.md"

    def analyze(self) -> dict[str, Any]:
        """
        Performs the workflow analysis.
        
        Returns:
            A dictionary containing stalled tasks, open loops, patterns, and suggestions.
        """
        report: dict[str, Any] = {
            "stalled_tasks": [], # [/] items
            "open_loops": [],    # [ ] items
            "recurring_patterns": [],
            "suggestions": []
        }

        # 1. Analyze Tasks
        if self.tasks_path.exists():
            lines = self.tasks_path.read_text(encoding='utf-8').splitlines()
            for line in lines:
                clean_line = line.strip()
                if "- [ ]" in clean_line:
                    report["open_loops"].append(clean_line.replace("- [ ]", "").strip())
                elif "- [/]" in clean_line:
                    report["stalled_tasks"].append(clean_line.replace("- [/]" , "").strip())

        # 2. Analyze Journal (Pattern Recognition)
        if self.journal_path.exists():
            journal_content = self.journal_path.read_text(encoding='utf-8').lower()

            # Simple keyword frequency analysis for "pain words"
            pain_keywords = ["manual", "fix", "error", "fail", "slow", "refactor", "broken"]

            # Count occurrences
            word_counts = Counter(re.findall(r'\b\w+\b', journal_content))
            common = word_counts.most_common(20)

            # Filter for interesting actionable words
            for word, count in common:
                if word in pain_keywords:
                    report["recurring_patterns"].append(f"High frequency of '{word}': {count} times")

        # 3. Generate Suggestions
        if report["stalled_tasks"]:
            report["suggestions"].append("CRITICAL: You have tasks explicitly marked 'In Progress' ([/]). Finish them or Reset them.")

        if len(report["open_loops"]) > 5:
            report["suggestions"].append("WARNING: Too many open loops. Close 3 tasks before opening new ones.")

        return report

def main() -> None:
    """CLI entry point for workflow analysis."""
    import os
    root = os.getcwd()
    analyst = WorkflowAnalyst(root)
    report = analyst.analyze()
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
