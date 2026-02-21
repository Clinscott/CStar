"""
[Mimir: COMPLEXITY]
Lore: "The Wise Counselor sees through tangled threads."
Purpose: Identify cyclomatic complexity and maintainability issues.
"""

from typing import Any

from radon.complexity import cc_visit
from radon.metrics import mi_visit

from src.sentinel.wardens.base import BaseWarden


class MimirWarden(BaseWarden):
    def scan(self) -> list[dict[str, Any]]:
        targets = []
        cc_threshold = self.config.get("MIMIR_CC_THRESHOLD", 10)
        mi_threshold = self.config.get("MIMIR_MI_THRESHOLD", 40) # < 40 is usually bad

        for py_file in self.root.rglob("*.py"):
            if self._should_ignore(py_file):
                continue

            try:
                content = py_file.read_text(encoding='utf-8')
                rel_path = str(py_file.relative_to(self.root))

                # --- [GUNGNIR CALCULUS: STRUCTURAL BEAUTY] ---
                # 1. Whitespace Rhythm Enforcement
                lines = content.split('\n')
                consecutive_logic = 0
                for line_idx, line in enumerate(lines):
                    stripped = line.strip()
                    if stripped and not stripped.startswith('#'):
                        consecutive_logic += 1
                        if consecutive_logic > 12: # Claustrophobia threshold
                            targets.append({
                                "type": "MIMIR_AESTHETIC_BREACH",
                                "file": rel_path,
                                "action": "Claustrophobic code block detected (>12 consecutive lines). Inject vertical whitespace for cognitive rhythm.",
                                "line": line_idx + 1,
                                "severity": "MEDIUM"
                            })
                            break
                    else:
                        consecutive_logic = 0

                # 2. Golden Ratio Setup-to-Execution Limit
                import ast
                try:
                    tree = ast.parse(content)
                    for node in ast.walk(tree):
                        if isinstance(node, ast.FunctionDef):
                            setup_nodes = 0
                            exec_nodes = 0
                            for child in node.body:
                                if isinstance(child, (ast.Assign, ast.AnnAssign, ast.Assert)):
                                    setup_nodes += 1
                                elif isinstance(child, (ast.For, ast.While, ast.Return, ast.Expr, ast.If)):
                                    exec_nodes += 1

                            if exec_nodes > 0:
                                ratio = setup_nodes / exec_nodes
                                if ratio > 1.7: # Exceeds ~1.618 limit
                                    targets.append({
                                        "type": "MIMIR_STRUCTURAL_BREACH",
                                        "file": rel_path,
                                        "action": f"Function '{node.name}' is top-heavy (Ratio: {ratio:.2f}). Extract setup/validation logic into helper functions.",
                                        "line": node.lineno,
                                        "severity": "MEDIUM"
                                    })
                except SyntaxError: pass

                # --- Original Mimir Checks ---
                # 1. Cyclomatic Complexity
                blocks = cc_visit(content)
                for block in blocks:
                    if block.complexity > cc_threshold:
                        targets.append({
                            "type": "MIMIR_COMPLEXITY",
                            "file": rel_path,
                            "action": f"Untangle Threads: Simplify {block.name} (CC: {block.complexity})",
                            "severity": "MEDIUM",
                            "line": block.lineno
                        })

                # 2. Maintainability Index
                mi_score = mi_visit(content, multi=False)
                if mi_score < mi_threshold:
                     targets.append({
                            "type": "MIMIR_MAINTAINABILITY",
                            "file": rel_path,
                            "action": f"Restructure Saga: File Maintainability Index too low ({mi_score:.2f} < {mi_threshold})",
                            "severity": "MEDIUM",
                            "line": 1
                        })

            except Exception:
                pass
        return targets
