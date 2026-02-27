"""
[WARDEN] Taste: HIGH-AGENCY AESTHETICS
Lore: "The Arbiter of Elegance purges the slop and enforces the Linscott Standard of Taste."
Purpose: Enforces high-end design principles, organic data patterns, and layout innovation.
Inspired by: Leonxlnx/taste-skill
"""

import re
from pathlib import Path
from typing import Any

from src.sentinel.wardens.base import BaseWarden


class TasteWarden(BaseWarden):
    """
    Warden that enforces 'Good Taste' in frontend code.
    Bans generic slop, pure blacks, and boring layouts.
    """
    
    FORBIDDEN_NAMES = [
        r"John Doe", r"Jane Doe", r"Acme Corp", r"SmartFlow", r"TaskMaster",
        r"Example User", r"Test User", r"test@example\.com"
    ]

    def scan(self) -> list[dict[str, Any]]:
        """
        Scans the project for 'slop' and aesthetic violations.
        """
        targets: list[dict[str, Any]] = []

        for tsx_file in self.root.rglob("*.tsx"):
            if self._should_ignore(tsx_file):
                continue

            try:
                content = tsx_file.read_text(encoding='utf-8')
                lines = content.splitlines()

                for i, line in enumerate(lines):
                    # 1. Check for Forbidden "Slop" Names
                    for pattern in self.FORBIDDEN_NAMES:
                        if re.search(pattern, line, re.IGNORECASE):
                            targets.append({
                                "type": "TASTE_SLOP_NAME",
                                "file": str(tsx_file.relative_to(self.root)),
                                "action": f"Generic name detected: '{pattern}'. Replace with creative, realistic identity (Taste Mandate).",
                                "line": i+1,
                                "severity": "MEDIUM"
                            })

                    # 2. Check for Pure Black (#000000)
                    if "#000000" in line.lower() or "black" in line.lower() and "bg-" in line:
                        # Allow 'black' if it's a tailwind color but warn if it's pure black
                        if "#000000" in line.lower() or "bg-black" in line.lower():
                            targets.append({
                                "type": "TASTE_PURE_BLACK",
                                "file": str(tsx_file.relative_to(self.root)),
                                "action": "Pure black detected. Use Zinc-950 or deep Charcoal (#0c0c0e) for premium depth.",
                                "line": i+1,
                                "severity": "LOW"
                            })

                    # 3. Check for Boring Layouts (Generic 3-column grid)
                    if "grid-cols-3" in line and "<div" in line:
                        # This is a bit naive, but we'll flag it as a "check"
                        targets.append({
                            "type": "TASTE_BORING_LAYOUT",
                            "file": str(tsx_file.relative_to(self.root)),
                            "action": "Generic 3-column grid detected. Consider asymmetric grids or zig-zag layouts for visual interest.",
                            "line": i+1,
                            "severity": "LOW"
                        })

                    # 4. Check for "Perfect" AI Data (e.g., 50%)
                    perfect_data = re.search(r"([1-9]0%)", line)
                    if perfect_data:
                         targets.append({
                            "type": "TASTE_ORGANIC_DATA",
                            "file": str(tsx_file.relative_to(self.root)),
                            "action": f"Mathematical perfection detected: '{perfect_data.group(1)}'. Use organic, 'messy' data (e.g. 47.2%) for realism.",
                            "line": i+1,
                            "severity": "LOW"
                        })

            except (OSError, PermissionError):
                pass

        return targets
