"""
[Mimir: COMPLEXITY]
Lore: "The Wise Counselor sees through tangled threads."
Purpose: Identify cyclomatic complexity and maintainability issues.
"""

from pathlib import Path
from typing import List, Dict, Any
from radon.complexity import cc_visit
from radon.metrics import mi_visit
from src.sentinel.wardens.base import BaseWarden

class MimirWarden(BaseWarden):
    def scan(self) -> List[Dict[str, Any]]:
        targets = []
        cc_threshold = self.config.get("MIMIR_CC_THRESHOLD", 10)
        mi_threshold = self.config.get("MIMIR_MI_THRESHOLD", 40) # < 40 is usually bad

        for py_file in self.root.rglob("*.py"):
            if self._should_ignore(py_file):
                continue

            try:
                content = py_file.read_text(encoding='utf-8')
                
                # 1. Cyclomatic Complexity
                blocks = cc_visit(content)
                for block in blocks:
                    if block.complexity > cc_threshold:
                        try:
                            rel_path = str(py_file.resolve().relative_to(self.root.resolve()))
                        except ValueError:
                            rel_path = str(py_file)
                        
                        targets.append({
                            "type": "MIMIR_COMPLEXITY",
                            "file": rel_path,
                            "action": f"Untangle Threads: Simplify {block.name} (CC: {block.complexity})",
                            "severity": "MEDIUM",
                            "line": block.lineno
                        })

                # 2. Maintainability Index
                # mi_visit returns a score.
                # If the score is low, we flag the whole file.
                # Note: mi_visit might calculate for the file content string directly? 
                # radon.metrics.mi_visit(code, multi=True) returns a dict if multi=True.
                mi_score = mi_visit(content, multi=False)
                if mi_score < mi_threshold:
                     targets.append({
                            "type": "MIMIR_MAINTAINABILITY",
                            "file": str(py_file.relative_to(self.root)),
                            "action": f"Restructure Saga: File Maintainability Index too low ({mi_score:.2f} < {mi_threshold})",
                            "severity": "MEDIUM",
                            "line": 1
                        })

            except Exception:
                pass
        return targets
