#!/usr/bin/env python3
"""
The Annexation Protocol (The Strategist)
Identity: ODIN
Purpose: Scan the territory, identify weakness (non-compliance), and propose a battle plan (ANNEXATION_PLAN.qmd).
Strandards: Linscott (Tests), Torvalds (Quality), Empire (Contracts), Edda (Docs).
"""

import ast
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# ==============================================================================
# 🛡️ THE STRATEGIST'S LOGIC
# ==============================================================================

class AnnexStrategist:
    def __init__(self, root_dir: Path):
        self.root = root_dir.resolve()
        self.plan_path = self.root / "ANNEXATION_PLAN.qmd"
        self.breaches = []
        self.edda_tasks = []

    def scan(self):
        """Conducts a full comprehensive audit of the territory."""
        print(f"[ANNEX] Scanning realm: {self.root}")
        
        # 1. Scan Code (Linscott & Torvalds)
        for py_file in self.root.rglob("*.py"):
            if self._should_ignore(py_file):
                continue
            self._audit_code(py_file)

        # 2. Scan Documentation (Edda)
        from edda import EddaWeaver  # Assumption: edda.py is in same dir or path
        # We can re-use Edda logic or just replicate the scan for speed
        # Replicating for now to keep loose coupling
        for md_file in self.root.rglob("*.md"):
            if self._should_ignore(md_file):
                continue
            # Edda ignores workflows by default, let's check
            if ".agent/workflows" in str(md_file.as_posix()):
                continue
                
            self.edda_tasks.append(md_file)

        self._generate_plan()

    def _should_ignore(self, path: Path) -> bool:
        """Determines if a file is outside jurisdiction."""
        parts = path.parts
        if ".git" in parts or ".venv" in parts or "__pycache__" in parts:
            return True
        if "node_modules" in parts or "target" in parts:
            return True
        if ".corvus_quarantine" in parts:
            return True
        # [ODIN] Tests do not require tests. Temp gauntlet is ephemeral.
        if "tests" in parts or "temp_gauntlet" in parts:
            return True
        # Ignore hidden files/dirs
        if any(p.startswith(".") for p in parts):
            return True
        return False

    def _audit_code(self, source: Path):
        """Checks for Linscott (Test) and Torvalds (Quality) compliance."""
        rel_path = source.relative_to(self.root)
        
        # A. Linscott Standard: Where is the test?
        test_path = self.root / "tests" / f"test_{source.stem}.py"
        # [ODIN] Also check Empire TDD path
        empire_test_path = self.root / "tests" / "empire_tests" / f"test_{source.stem}_empire.py"
        
        if not test_path.exists() and not empire_test_path.exists():
            # Try recursive mirror: src/foo.py -> tests/src/test_foo.py
            mirror_test = self.root / "tests" / rel_path.parent / f"test_{source.stem}.py"
            if not mirror_test.exists():
                 self.breaches.append({
                    "type": "LINSCOTT_BREACH",
                    "file": rel_path.as_posix(),
                    "action": f"Scaffold test for {source.name}",
                    "severity": "CRITICAL"
                })

        # B. Torvalds Protocol: Complexity & Linting
        # We can implement a simple check here or rely on external tools
        # For this implementation, we'll do a quick AST check for empty excepts
        try:
            tree = ast.parse(source.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                # Check for bare except
                if isinstance(node, ast.ExceptHandler) and node.type is None:
                     self.breaches.append({
                        "type": "TORVALDS_BREACH",
                        "file": rel_path.as_posix(),
                        "action": f"Fix bare except at line {node.lineno}",
                        "severity": "HIGH"
                    })
        except Exception:
            pass # Parser error already a breach implicitly

    def _generate_plan(self):
        """Weaves the findings into a QMD battle plan."""
        
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        plan = [
            "---",
            "title: Annexation Plan",
            f"date: {timestamp}",
            "status: pending_approval",
            "---",
            "",
            "# ⚔️ The Annexation Plan",
            "",
            "> [!IMPORTANT]",
            "> **The Runes Have Been Cast.**",
            "> Review the identified weaknesses below. To execute this plan, run: `c* annex --execute`",
            "",
            "## 🛡️ Linscott Standard (Test Verification)",
            "Every script must have a companion test. 'Trust, but Verify.'",
            ""
        ]
        
        linscott_breaches = [b for b in self.breaches if b["type"] == "LINSCOTT_BREACH"]
        if linscott_breaches:
            for b in linscott_breaches:
                plan.append(f"- [ ] **[MISSING TEST]** `{b['file']}` → Scaffold `{b['action']}`")
        else:
            plan.append("*(No breaches detected. The defense is solid.)*")

        plan.append("")
        plan.append("## 🐧 Torvalds Protocol (Code Quality)")
        plan.append("Structural integrity mandates. No bare excepts. Strict typing.")
        
        torvalds_breaches = [b for b in self.breaches if b["type"] == "TORVALDS_BREACH"]
        if torvalds_breaches:
            for b in torvalds_breaches:
                plan.append(f"- [ ] **[quality]** `{b['file']}` → {b['action']}")
        else:
            plan.append("*(No breaches detected. Code is clean.)*")
            
        plan.append("")
        plan.append("## 📜 The Edda (Documentation)")
        plan.append("Legacy markdown must be transmuted to Quarto. Workflows are preserved.")
        
        if self.edda_tasks:
            for doc in self.edda_tasks:
                rel = doc.relative_to(self.root)
                plan.append(f"- [ ] **[TRANSMUTE]** `{rel.as_posix()}` → `{doc.stem}.qmd` (Original Quarantined)")
        else:
            plan.append("*(No legacy scrolls found.)*")

        plan.append("")
        plan.append("---")
        plan.append("")
        plan.append("## ⚡ Execution Strategy")
        plan.append("1. **Approve**: Mark items as `[x]` to confirm.")
        plan.append("2. **Execute**: Run the annexation command.")
        
        self.plan_path.write_text("\n".join(plan), encoding="utf-8")
        print(f"[ANNEX] Plan generated: {self.plan_path}")
        print(f"[ANNEX] Breaches found: Linscott={len(linscott_breaches)}, Torvalds={len(torvalds_breaches)}, Edda={len(self.edda_tasks)}")

# ==============================================================================
# 🚀 ENTRY POINT
# ==============================================================================

def main():
    if len(sys.argv) < 2:
        print("Usage: annex.py --scan [ROOT]")
        sys.exit(1)
        
    cmd = sys.argv[1]
    if cmd == "--scan":
        root = Path(sys.argv[2]) if len(sys.argv) > 2 else Path.cwd()
        strategist = AnnexStrategist(root)
        strategist.scan()
    elif cmd == "--execute":
        print("[ANNEX] Execution module not yet linked. Review ANNEXATION_PLAN.qmd first.")

if __name__ == "__main__":
    main()
