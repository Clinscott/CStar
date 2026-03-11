"""
[WARDEN] Scour Warden
Lore: "The broom of the high halls."
Purpose: Identifies and purges legacy references, orphaned mocks, and architectural clutter.
"""

import os
import re
from pathlib import Path
from typing import Any

from src.sentinel.wardens.base import BaseWarden
from src.core.sovereign_hud import SovereignHUD

class ScourWarden(BaseWarden):
    """
    [Ω] The Janitor of the Totem.
    Scours the Archive for legacy 'c*' commands and outdated metadata.
    """

    def scan(self) -> list[dict[str, Any]]:
        breaches = []
        SovereignHUD.log("INFO", "ScourWarden: Initiating system-wide sweep...")

        # 1. Scour for legacy c* references
        breaches.extend(self._scour_legacy_commands())

        # 2. Scour for orphaned .stats files
        breaches.extend(self._scour_orphaned_stats())

        # 3. Scour for stale .agents/lore/ temp files
        breaches.extend(self._scour_stale_lore())

        return breaches

    def _scour_legacy_commands(self) -> list[dict[str, Any]]:
        """Finds legacy 'c*' strings that should be 'cstar'."""
        breaches = []
        pattern = re.compile(r'\bc\* (start|ravens|status|mcp|lets-go|plan|wrap-it-up|investigate)\b')

        # [Ω] SAFE WALK: Manual traversal to respect _should_ignore
        for root, dirs, files in os.walk(self.root, followlinks=False):
            # Depth guard: Don't go deeper than 10 levels for scour
            rel_root = Path(root).relative_to(self.root)
            if len(rel_root.parts) > 10:
                dirs[:] = [] # Stop recursion
                continue

            # Prune ignored directories in-place for efficiency
            dirs[:] = [d for d in dirs if not self._should_ignore(Path(root) / d)]
            
            for file in files:
                if not file.endswith((".qmd", ".md")): continue
                
                path = Path(root) / file
                try:
                    content = path.read_text(encoding='utf-8')
                    matches = list(pattern.finditer(content))
                    for m in matches:
                        line_no = content.count('\n', 0, m.start()) + 1
                        breaches.append({
                            "type": "LEGACY_COMMAND",
                            "file": str(path.relative_to(self.root)),
                            "action": f"REPLACE: '{m.group(0)}' with 'cstar {m.group(1)}'",
                            "severity": "LOW",
                            "line": line_no
                        })
                except Exception:
                    continue

        return breaches

    def _scour_orphaned_stats(self) -> list[dict[str, Any]]:
        """Finds .stats files that no longer have a corresponding source file."""
        breaches = []
        stats_dir = self.root / ".stats"
        if not stats_dir.exists():
            return []

        # [Ω] OPTIMIZED ORPHAN CHECK: Avoid rglob inside a loop
        # We just check for common locations
        for path in stats_dir.glob("*.json"):
            src_name = path.stem
            
            # Common locations for source files
            potential_locations = [
                self.root / "src" / "core" / f"{src_name}.py",
                self.root / "src" / "sentinel" / f"{src_name}.py",
                self.root / "src" / "node" / "core" / f"{src_name}.ts",
                self.root / "cstar.ts",
                self.root / f"{src_name}.qmd"
            ]
            
            found = any(p.exists() for p in potential_locations)
            
            if not found:
                breaches.append({
                    "type": "ORPHANED_STATS",
                    "file": str(path.relative_to(self.root)),
                    "action": "PURGE: No matching source file found.",
                    "severity": "LOW"
                })

        return breaches

    def _scour_stale_lore(self) -> list[dict[str, Any]]:
        """Finds temp or backup files in .agents/lore."""
        breaches = []
        lore_dir = self.root / ".agents" / "lore"
        if not lore_dir.exists():
            return []

        for path in lore_dir.glob("*"):
            if path.suffix in [".bak", ".tmp", ".old"] or "~" in path.name:
                breaches.append({
                    "type": "STALE_LORE",
                    "file": str(path.relative_to(self.root)),
                    "action": "PURGE: Stale or temporary lore asset.",
                    "severity": "LOW"
                })
        return breaches
