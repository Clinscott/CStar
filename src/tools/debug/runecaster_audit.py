"""
[ODIN] RuneCaster - The All-Seeing Eye of Type Safety.
Lore: "Casting the Runes of Definition across the codebase."
Purpose: Encapsulates the AST-based logic for identifying type-hint breaches.
"""

import ast
from pathlib import Path
from typing import Any


class RuneCasterAudit:
    """
    Core engine for type-safety auditing.
    Scans for missing argument hints, non-strict __init__ returns, and generic weaknesses.
    """

    def __init__(self, root: Path) -> None:
        self.root = root

    def _should_ignore(self, path: Path) -> bool:
        """Standard filter for the watchtowers."""
        ignored_dirs = {".git", ".venv", "node_modules", "__pycache__", ".agent", ".pytest_cache", "dist", "build"}
        return any(part in ignored_dirs for part in path.parts)

    def run(self) -> list[dict[str, Any]]:
        """
        Executes the audit across the project realm.
        Returns a list of breach dictionaries.
        """
        targets = []
        for py_file in self.root.rglob("*.py"):
            if self._should_ignore(py_file):
                continue

            try:
                content = py_file.read_text(encoding='utf-8')
                tree = ast.parse(content)
                rel_path = str(py_file.relative_to(self.root))

                for node in ast.walk(tree):
                    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        # 1. Check Missing Argument Hints
                        # Skip 'self' and 'cls' as they are standard
                        missing_args = [
                            arg.arg for arg in node.args.args 
                            if arg.annotation is None and arg.arg not in ('self', 'cls')
                        ]
                        
                        if missing_args:
                            targets.append({
                                "type": "RUNE_MISSING_ARGS",
                                "file": rel_path,
                                "action": f"Cast Runes: Add type hints for arguments {missing_args} in '{node.name}'",
                                "severity": "LOW",
                                "line": node.lineno
                            })

                        # 2. Check Missing Return Hints
                        if node.returns is None:
                            if node.name == "__init__":
                                targets.append({
                                    "type": "RUNE_STRICT_INIT",
                                    "file": rel_path,
                                    "action": f"Cast Strict Rune: __init__ must return -> None in '{node.name}'",
                                    "severity": "LOW",
                                    "line": node.lineno
                                })
                            else:
                                targets.append({
                                    "type": "RUNE_MISSING_RET",
                                    "file": rel_path,
                                    "action": f"Cast Runes: Add return type hint for '{node.name}'",
                                    "severity": "LOW",
                                    "line": node.lineno
                                })

                        # 3. Check Weak Generics (raw list, dict, set)
                        for arg in node.args.args:
                            if isinstance(arg.annotation, ast.Name):
                                if arg.annotation.id in ('list', 'dict', 'set', 'tuple'):
                                    targets.append({
                                        "type": "RUNE_WEAK_GENERIC",
                                        "file": rel_path,
                                        "action": f"Strengthen Rune: Use {arg.annotation.id}[T] instead of raw '{arg.annotation.id}' for arg '{arg.arg}'",
                                        "severity": "LOW",
                                        "line": node.lineno
                                    })
                                    
            except (SyntaxError, UnicodeDecodeError):
                # We do not falter at broken runes, we simply pass.
                pass
            except Exception:
                # Log unexpected errors to system if necessary
                pass

        return targets


if __name__ == "__main__":
    import sys
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd()
    audit = RuneCasterAudit(root)
    results = audit.run()
    print(f"[Ω] RuneCaster Scan Complete. {len(results)} breaches found.")
    for r in results[:10]:
        print(f"  - {r['file']}:{r['line']} -> {r['action']}")
