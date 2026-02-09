#!/usr/bin/env python3
"""
[ODIN] Code Sentinel - Structural Integrity Scanner.
[Ω] HEIMDALL'S VIGIL / [ALFRED] THE PERIMETER
Refined for the Linscott Standard (Typing, Pathlib, Encapsulation).
"""

import argparse
import ast
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# Ensure UTF-8 output for box-drawing characters
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding='utf-8')

# Add project root to path
project_root = Path(__file__).parent.parent.parent.absolute()
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.core.ui import HUD



class CodeSentinel:
    """
    Main orchestrator for code integrity scanning.
    """

    TEXT_MAP = {
        "ODIN": {
            "TITLE": "[Ω] HEIMDALL SECURITY SCAN",
            "PASS": "SECTOR SECURE. NO ANOMALIES.",
            "FAIL": "CONTAINMENT BREACH DETECTED.",
            "SCAN_TARGET": "TARGET SECTOR",
            "VIOLATIONS": "ANOMALIES",
            "V_PREFIX": "[!] BREACH",
            "STRUCT_CODE": "STRUCT-001"
        },
        "ALFRED": {
            "TITLE": "[A] THE PERIMETER SCAN",
            "PASS": "The manor is immaculate, sir.",
            "FAIL": "I found some items out of place, sir.",
            "SCAN_TARGET": "SCAN AREA",
            "VIOLATIONS": "FINDINGS",
            "V_PREFIX": "[i] NOTE",
            "STRUCT_CODE": "HOUSEKEEP-01"
        }
    }

    def __init__(self, target: str = ".", fix: bool = False, persona_override: Optional[str] = None):
        self.target = Path(target)
        self.fix = fix
        self.scripts_dir = Path(__file__).parent.absolute()
        self.project_root = self.scripts_dir.parent.parent
        self.config = self._load_config()
        HUD.PERSONA = persona_override.upper() if persona_override else self.config.get("Persona", "ALFRED").upper()
        if HUD.PERSONA == "GOD":
            HUD.PERSONA = "ODIN"

    def _load_config(self) -> dict:
        config_path = self.project_root / ".agent" / "config.json"
        if config_path.exists():
            try:
                with open(config_path, encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def scan_for_orphans(self, filepath: Path) -> List[Dict[str, Any]]:
        """AST-based scan for top-level functions (orphans)."""
        if not filepath.suffix == ".py" or not filepath.is_file():
            return []

        violations = []
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                lines = f.readlines()
                content = "".join(lines)
            
            tree = ast.parse(content)
        except Exception as e:
            return [{
                "code": "SYNTAX", 
                "filename": str(filepath), 
                "location": {"row": 1, "column": 0}, 
                "message": str(e), 
                "severity": "CRITICAL"
            }]

        persona = HUD.PERSONA if HUD.PERSONA in self.TEXT_MAP else "ALFRED"
        v_code = self.TEXT_MAP[persona]["STRUCT_CODE"]

        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.name == "main" or node.name.startswith("_"):
                    continue

                def_line = lines[node.lineno - 1]
                if "@sentinel: ignore" in def_line:
                    continue

                violations.append({
                    "code": v_code,
                    "filename": str(filepath),
                    "location": {"row": node.lineno, "column": node.col_offset},
                    "message": f"Orphaned Function '{node.name}'. Encapsulate or Privatize.",
                    "severity": "CRITICAL"
                })
        
        return violations

    def run_ruff(self) -> List[Dict[str, Any]]:
        """Executes Ruff check for linting and style metrics."""
        cmd = [sys.executable, "-m", "ruff", "check", str(self.target), "--output-format=json"]
        config_path = self.project_root / "ruff.toml"

        if config_path.exists():
            cmd.extend(["--config", str(config_path)])

        if self.fix:
            cmd.append("--fix")

        try:
            # Use specific encoding for Windows compatibility
            result = subprocess.run(cmd, capture_output=True, timeout=30)
            stdout = result.stdout.decode('utf-8', errors='replace')
            stderr = result.stderr.decode('utf-8', errors='replace')
            
            if not stdout.strip():
                if stderr and "error:" in stderr.lower():
                    # Strip lines for brevity
                    err_lines = [l for l in stderr.splitlines() if l.strip()]
                    HUD.box_row("RUFF ERROR", err_lines[0][:60] if err_lines else "Unknown", HUD.RED)
                return []

            try:
                return json.loads(stdout)
            except json.JSONDecodeError:
                return []
                
        except FileNotFoundError:
            HUD.log("WARN", "Sentinel", "Ruff not found. Style scan skipped.")
            return []
        except subprocess.TimeoutExpired:
            HUD.log("WARN", "Sentinel", "Ruff scan timed out.")
            return []
        except Exception as e:
            HUD.log("FAIL", "Sentinel Error", str(e))
            return []

    def format_results(self, violations: List[Dict[str, Any]]) -> None:
        """Visual representation of scan results."""
        persona = HUD.PERSONA if HUD.PERSONA in self.TEXT_MAP else "ALFRED"
        text = self.TEXT_MAP[persona]
        
        HUD.box_top(text["TITLE"])
        HUD.box_row(text["SCAN_TARGET"], str(self.target), HUD.CYAN)

        if self.fix:
            HUD.box_row("ACTION", "REPAIR ATTEMPTED (--fix)", HUD.YELLOW)

        HUD.box_row(text["VIOLATIONS"], str(len(violations)), HUD.RED if violations else HUD.GREEN)

        if violations:
            HUD.box_separator()
            # Show top 15 findings
            for v in violations[:15]:
                filename = Path(v['filename']).name
                loc = f"{filename}:{v['location']['row']}:{v['location']['column']}"
                severity = v.get('severity', '')
                color = HUD.RED if ("Error" in severity or "CRITICAL" in severity or severity == "ERROR") else HUD.YELLOW
                prefix = text["V_PREFIX"]
                HUD.box_row(f"{prefix} {v['code']}", f"{loc} - {v['message'][:50]}", color, dim_label=True)

            if len(violations) > 15:
                HUD.box_row("...", f"+ {len(violations) - 15} more findings", dim_label=True)
        else:
            HUD.box_row("STATUS", text["PASS"], HUD.GREEN)

        HUD.box_bottom()

    def execute_audit(self) -> bool:
        """Main entry point for the audit cycle."""
        violations = self.run_ruff()
        
        # Structure Scan
        if self.target.is_file():
            violations.extend(self.scan_for_orphans(self.target))
        elif self.target.is_dir():
            for py_file in self.target.rglob("*.py"):
                violations.extend(self.scan_for_orphans(py_file))

        self.format_results(violations)
        return len(violations) == 0


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Corvus Star Code Sentinel")
    parser.add_argument("target", nargs="?", default=".", help="File or directory to scan")
    parser.add_argument("--fix", action="store_true", help="Auto-fix violations")
    parser.add_argument("--persona", choices=["ODIN", "ALFRED"], help="Override persona")
    args = parser.parse_args()

    sentinel = CodeSentinel(target=args.target, fix=args.fix, persona_override=args.persona)
    success = sentinel.execute_audit()
    
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
