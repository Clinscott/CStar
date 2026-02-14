"""
[Edda: DOCUMENTATION]
Lore: "The Saga of the Code."
Purpose: Identify functions missing docstrings and legacy markdown files.
"""

import ast
from pathlib import Path
from typing import List, Dict, Any
from src.sentinel.wardens.base import BaseWarden

class EddaWarden(BaseWarden):
    def scan(self) -> List[Dict[str, Any]]:
        targets = []
        
        # 1. Legacy Markdown Detection (.md -> .qmd)
        # We ignore README.md as it's standard.
        for md_file in self.root.rglob("*.md"):
            if self._should_ignore(md_file):
                continue
            
            if md_file.name.upper() == "README.MD":
                continue

            # Check if it should be .qmd (Quarto Markdown)
            # This is a style choice in Corvus Star.
            targets.append({
                "type": "EDDA_LEGACY_FORMAT",
                "file": str(md_file.relative_to(self.root)),
                "action": "Transmute Legacy Saga: Convert .md to .qmd for Quarto compatibility.",
                "severity": "LOW",
                "line": 1
            })

        # 2. Docstring & Signature Matching
        for py_file in self.root.rglob("*.py"):
            if self._should_ignore(py_file):
                continue

            try:
                content = py_file.read_text(encoding='utf-8')
                tree = ast.parse(content)
                
                for node in ast.walk(tree):
                    if isinstance(node, (ast.FunctionDef, ast.ClassDef, ast.AsyncFunctionDef)):
                        docstring = ast.get_docstring(node)
                        if not docstring:
                             targets.append({
                                "type": "EDDA_MISSING_DOC",
                                "file": str(py_file.relative_to(self.root)),
                                "action": f"Weave Saga (Docstring) for {node.name}",
                                "severity": "LOW",
                                "line": node.lineno
                            })
                        else:
                            # Signature Matching (Advanced)
                            # Check if args are mentioned in docstring
                            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                                args = [a.arg for a in node.args.args if a.arg not in ('self', 'cls')]
                                missing_args = [arg for arg in args if arg not in docstring]
                                if missing_args:
                                    targets.append({
                                        "type": "EDDA_INCOMPLETE_DOC",
                                        "file": str(py_file.relative_to(self.root)),
                                        "action": f"Update Saga: Docstring missing args {missing_args} for {node.name}",
                                        "severity": "LOW",
                                        "line": node.lineno
                                    })

            except Exception: pass
            
        return targets
