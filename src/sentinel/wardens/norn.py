"""
[Norn: CAMPAIGN FATE]
Lore: "The Weavers of Destiny."
Purpose: Parse CAMPAIGN_IMPLEMENTATION_PLAN.qmd to find the next actionable task.
"""

import re
from pathlib import Path
from typing import List, Dict, Any, Optional
from src.sentinel.wardens.base import BaseWarden

class NornWarden(BaseWarden):
    def __init__(self, root: Path):
        super().__init__(root)
        self.plan_path = root / ".agent" / "CAMPAIGN_IMPLEMENTATION_PLAN.qmd"

    def scan(self) -> List[Dict[str, Any]]:
        """
        Norn doesn't just scan for errors, it returns the next Campaign Mission.
        But to fit the interface, we return it as a high-priority 'breach' (task).
        """
        target = self.get_next_target()
        if target:
            # Campaign tasks are treated as CRITICAL breaches because they are the user's primary directive.
            return [{
                "type": "CAMPAIGN_TASK",
                "file": target["file"],
                "action": target["action"],
                "severity": "CRITICAL",
                "line": target["line_index"] + 1,
                "raw_target": target # Keep the full object for Muninn
            }]
        return []

    def get_next_target(self) -> Optional[Dict[str, Any]]:
        """
        Scans the plan for the first unstruck, actionable item in a markdown table.
        Uses dynamic header parsing based on column names.
        """
        if not self.plan_path.exists():
            return None

        lines = self.plan_path.read_text(encoding='utf-8').splitlines()
        
        headers = []
        col_indices = {}

        # Scan for table header
        for i, line in enumerate(lines):
            if "|" in line and "---" not in line and not headers:
                # Potential header
                headers = [h.strip() for h in line.split("|") if h.strip()]
                # Map headers to indices (accounting for empty split strings if pipe is at start/end)
                parts = [p.strip() for p in line.split("|")]
                # Filter out empty strings from split logic if they are just padding
                # Actually, simpler approach:
                # Find indices of specific columns
                lower_parts = [p.lower().strip() for p in parts]
                
                if "file" in lower_parts and "description" in lower_parts:
                    for idx, part in enumerate(lower_parts):
                         if "file" in part: col_indices["file"] = idx
                         if "description" in part: col_indices["description"] = idx
                         if "target" in part: col_indices["target"] = idx # Optional
                         if "type" in part: col_indices["type"] = idx     # Optional
                    continue

            # Skip separator lines
            if "---" in line:
                continue

            # Process row if we have headers
            if col_indices and "|" in line:
                # Skip struck-through lines
                if "~~" in line:
                    continue

                parts = line.split("|")
                if len(parts) <= max(col_indices.values()):
                    continue

                file_target = parts[col_indices["file"]].strip().replace("`", "")
                description = parts[col_indices["description"]].strip()
                
                # Check for "Target" column if it exists, otherwise use empty
                target_name = parts[col_indices["target"]].strip() if "target" in col_indices else "Unknown"
                action_type = parts[col_indices["type"]].strip() if "type" in col_indices else "TASK"

                if not file_target or not description:
                    continue

                # Validation: Check if file exists (unless it's a NEW task)
                # If the description says "Create" or "New", we assume file might not exist.
                # Otherwise, if file doesn't exist, we might flag it or just proceed.
                # For now, we return it regardless, but we *could* verify existence here.
                
                return {
                    "type": "CAMPAIGN_TASK",
                    "file": file_target,
                    "action": f"[{action_type}] {description} (Target: {target_name})",
                    "line_index": i,
                    "raw_line": line
                }
        return None

    def mark_complete(self, target: Dict[str, Any]):
        """
        Marks the action as complete by striking it through in the plan.
        """
        if not self.plan_path.exists():
            return

        lines = self.plan_path.read_text(encoding='utf-8').splitlines()
        idx = target.get('line_index', -1)
        if idx == -1 and 'raw_target' in target:
             idx = target['raw_target'].get('line_index', -1)

        if idx >= 0 and idx < len(lines):
                # Simple heuristic: wrap the description in ~~ if not already
                if "~~" not in line:
                    # Strike through the description text by wrapping non-empty parts in ~~

                parts = line.split("|")
                # We can try to guess the description column again or pass it.
                # Let's assume standard format for modification to be safe, or just strike the whole line?
                # Striking the whole line is safer for visual confirmation.
                # Reconstruct line with ~~ around the content parts
                new_parts = []
                for p in parts:
                    if p.strip() and "~~" not in p:
                         new_parts.append(f" ~~{p.strip()}~~ ")
                    else:
                        new_parts.append(p)
                lines[idx] = "|".join(new_parts)
                self.plan_path.write_text("\n".join(lines), encoding='utf-8')
