"""
[Norn: CAMPAIGN FATE]
Lore: "The Weavers of Destiny."
Purpose: Parse CAMPAIGN_IMPLEMENTATION_PLAN.qmd to find the next actionable task.
"""

from pathlib import Path
from typing import Any

from src.sentinel.wardens.base import BaseWarden


class NornWarden(BaseWarden):
    def __init__(self, root: Path) -> None:
        # Initialize BaseWarden with project root
        super().__init__(root)
        self.plan_path = root / "tasks.qmd"

    def scan(self) -> list[dict[str, Any]]:
        """
        Norn doesn't just scan for errors, it returns the next Campaign Mission.
        But to fit the interface, we return it as a high-priority 'breach' (task).
        """
        # Scan synchronous map of tasks
        target = self.get_next_target()

        if target:
            # Campaign tasks are treated as CRITICAL breaches because they are the user's primary directive.
            return [{
                "type": "CAMPAIGN_TASK",
                "file": "tasks.qmd",
                "action": target["action"],
                "severity": "CRITICAL",
                "line": target["line_index"] + 1,
                "raw_target": target # Keep the full object for Muninn
            }]
        return []

    def _parse_task_line(self, line: str, index: int) -> dict | None:
        """Helper to parse a single line for a task."""
        stripped = line.strip()
        if stripped.startswith("- [ ]"):
            return {
                "type": "CAMPAIGN_TASK",
                "file": "tasks.qmd",
                "action": stripped[5:].strip(),
                "line_index": index,
                "raw_line": line
            }
        return None

    def get_next_target(self) -> dict[str, Any] | None:
        """
        Scans tasks.qmd for the first unchecked item '- [ ]'.
        """
        if not self.plan_path.exists():
            return None

        lines = self.plan_path.read_text(encoding='utf-8').splitlines()
        for i, line in enumerate(lines):
            target = self._parse_task_line(line, i)
            if target:
                return target
        return None

    def mark_complete(self, target: dict[str, Any]) -> None:
        """
        Marks the action as complete by switching '[ ]' to '[x]'.
        """
        if not self.plan_path.exists():
            return

        lines = self.plan_path.read_text(encoding='utf-8').splitlines()
        idx = target.get('line_index', -1)

        if idx >= 0 and idx < len(lines):
            line = lines[idx]
            if "- [ ]" in line:
                # Replace the first occurrence of dash-space-bracket-space-bracket
                # We want to preserve indentation.
                # Regex or simple replace is fine since we know the structure from scan.
                # But simple replace "- [ ]" -> "- [x]" is safest for single occurrence lines.
                lines[idx] = line.replace("- [ ]", "- [x]", 1)
                self.plan_path.write_text("\n".join(lines), encoding='utf-8')
