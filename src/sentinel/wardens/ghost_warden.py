"""
[WARDEN] Ghost Warden (v1.0)
Lore: "The eyes that watch the thoughts before they become deeds."
Purpose: Precognitive in-memory adjudication of agent-driven file mutations.
"""

import re
from pathlib import Path
from typing import Any

from src.sentinel.wardens.base import BaseWarden
from src.core.sovereign_hud import SovereignHUD

class GhostWarden(BaseWarden):
    """
    Ghost Warden: Intercepts raw strings in-memory and calculates Gungnir score delta.
    Mandate: Pre-disk fail-safe for agentic tool calls.
    """

    def __init__(self, root: Path) -> None:
        super().__init__(root)
        self.persona = "GHOST"

    def scan(self) -> list[dict[str, Any]]:
        """Ghost Warden does not perform full repository scans. Use adjudicate()."""
        return []

    def adjudicate(self, file_path: str, content: str) -> dict[str, Any]:
        """
        Calculates a high-speed Gungnir score based on raw string heuristics.
        
        Args:
            file_path: The target file path.
            content: The proposed in-memory content.
            
        Returns:
            A dictionary with status (CLEARED/WARNING) and score.
        """
        SovereignHUD.persona_log("GHOST", f"Intercepting mutation for {file_path}...")
        
        score = 1.0
        reasons = []

        # 1. Bracket Integrity (JS/TS/C/C#/Java)
        if any(file_path.endswith(ext) for ext in [".ts", ".tsx", ".js", ".jsx", ".cs", ".cpp"]):
            open_braces = content.count("{")
            close_braces = content.count("}")
            if open_braces != close_braces:
                score -= 0.4
                reasons.append(f"Unmatched Brackets: {{ {open_braces} vs }} {close_braces}")

        # 2. Semicolon Frequency (Heuristic for JS/TS)
        if any(file_path.endswith(ext) for ext in [".ts", ".tsx", ".js", ".jsx"]):
            lines = content.splitlines()
            if len(lines) > 5:
                # Count lines ending with characters that aren't semicolons, braces, or commas
                # (Very loose heuristic, but captures sloppy agent generation)
                loose_lines = 0
                for line in lines:
                    line = line.strip()
                    if line and not any(line.endswith(c) for c in [";", "{", "}", ",", "[", "]", "(", ")", ":"]):
                        loose_lines += 1
                
                if loose_lines / len(lines) > 0.4:
                    score -= 0.2
                    reasons.append("Low Semicolon Density (Loose Heuristic)")

        # 3. Indentation Complexity (Python/TS)
        # Deeply nested code is often a sign of agent hallucinations or "nesting-collapse"
        max_indent = 0
        for line in content.splitlines():
            indent = len(line) - len(line.lstrip())
            max_indent = max(max_indent, indent)
        
        if max_indent > 40: # Arbitrary threshold for "ridiculous" nesting
            score -= 0.3
            reasons.append(f"Excessive Cyclomatic Complexity (Depth: {max_indent})")

        # 4. Critical Breach Check (Omission placeholders)
        placeholders = ["rest of methods", "unchanged code", "...", "(rest of code)"]
        for p in placeholders:
            if p in content.lower():
                score -= 0.5
                reasons.append(f"Forbidden Placeholder Detected: '{p}'")

        # Final Adjudication
        status = "PULSE_CLEARED" if score >= 0.80 else "PRECOGNITIVE_WARNING"
        
        return {
            "status": status,
            "score": round(score, 2),
            "reasons": reasons
        }
