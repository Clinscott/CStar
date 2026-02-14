"""
[RuneCaster: TYPE SAFETY]
Lore: "Casting the Runes of Definition."
Purpose: Identify missing type hints using AST.
"""

import ast
from pathlib import Path
from typing import List, Dict, Any
from src.sentinel.wardens.base import BaseWarden

class RuneCasterWarden(BaseWarden):
    def scan(self) -> List[Dict[str, Any]]:
        targets = []
        for py_file in self.root.rglob("*.py"):
            if self._should_ignore(py_file): 
                continue

            try:
                content = py_file.read_text(encoding='utf-8')
                tree = ast.parse(content)
                for node in ast.walk(tree):
                    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        # Check 1: Missing Argument Hints
                        missing_arg = any(arg.annotation is None for arg in node.args.args if arg.arg not in ('self', 'cls'))
                        missing_ret = node.returns is None
                        
                        if missing_arg or missing_ret:
                            # Special Check: __init__ must return None
                            if node.name == "__init__" and missing_ret:
                                targets.append({
                                    "type": "RUNE_STRICT_INIT",
                                    "file": str(py_file.relative_to(self.root)),
                                    "action": f"Cast Strict Rune: __init__ must return -> None in {node.name}",
                                    "severity": "LOW",
                                    "line": node.lineno
                                })
                            elif node.name != "__init__": # Regular check
                                targets.append({
                                    "type": "RUNE_MISSING",
                                    "file": str(py_file.relative_to(self.root)),
                                    "action": f"Cast Runes (Type Hints) for {node.name}",
                                    "severity": "LOW",
                                    "line": node.lineno
                                })

                        # Check 2: Generic Type Enforcement (e.g., list vs list[str])
                        # This is tricky with AST as we need to see if the annotation is a raw 'list', 'dict', etc.
                        for arg in node.args.args:
                            if arg.annotation:
                                if isinstance(arg.annotation, ast.Name):
                                    if arg.annotation.id in ('list', 'dict', 'set', 'tuple'):
                                        targets.append({
                                            "type": "RUNE_WEAK_GENERIC",
                                            "file": str(py_file.relative_to(self.root)),
                                            "action": f"Strengthen Rune: Use generic {arg.annotation.id}[T] instead of raw {arg.annotation.id} for arg '{arg.arg}'",
                                            "severity": "LOW",
                                            "line": node.lineno
                                        })
            except Exception: pass
        return targets
