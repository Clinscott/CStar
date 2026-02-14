"""
[Valkyrie: PRUNING]
Lore: "Choosers of the Slain."
Purpose: Identify unused imports and unreachable code using Vulture.
"""

from pathlib import Path
from typing import List, Dict, Any
import vulture
from src.sentinel.wardens.base import BaseWarden

class ValkyrieWarden(BaseWarden):
    def scan(self) -> List[Dict[str, Any]]:
        targets = []
        try:
            v = vulture.Vulture(verbose=False)
            py_files = []
            
            # Scavenge all python files not in ignored dirs
            for p in self.root.rglob("*.py"):
                if self._should_ignore(p):
                    continue
                py_files.append(str(p))
            
            v.scavenge(py_files)
            
            # Get threshold from config or default to 60 (standard confidence)
            # The previous code used 20, but user requested it be configurable.
            min_confidence = self.config.get("VULTURE_CONFIDENCE", 60)
            
            raw_items = v.get_unused_code()
            
            for item in raw_items:
                # Ignore structural files
                if "__init__.py" in item.filename:
                    continue
                
                if item.confidence < min_confidence:
                    continue
                
                lineno = getattr(item, "first_lineno", getattr(item, "lineno", 1))
                
                try:
                    rel_path = str(Path(item.filename).resolve().relative_to(self.root.resolve()))
                except ValueError:
                    rel_path = str(item.filename)

                targets.append({
                    "type": "VALKYRIE_BREACH",
                    "file": rel_path,
                    "action": f"Prune Dead Code: {item.message} at line {lineno} (Confidence: {item.confidence}%)",
                    "severity": "LOW",
                    "line": lineno
                })
        except Exception:
            pass
        return targets
