"""
[LEVEL 5 DIAGNOSTIC: THE OMNI-AUDIT (CHANT INTEGRATION)]
Identity: ALFRED / O.D.I.N.
Purpose: Deep structural sweep. Outputs findings to be processed by the Chant Weave.
"""
import sys
import time
import json
import re
from pathlib import Path
from collections import defaultdict
import subprocess

PROJECT_ROOT = Path(__file__).resolve().parents[4]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.sovereign_hud import SovereignHUD

class Level5Diagnostic:
    def __init__(self, root: Path):
        self.root = root
        self.stats = {"scanned": 0, "legacy_drift": 0, "linscott_breaches": 0, "complexity_warnings": 0}
        self.findings = []
        
        self.active_skills = set()
        skills_dir = self.root / ".agents" / "skills"
        if skills_dir.exists():
            for d in skills_dir.iterdir():
                if d.is_dir() and not d.name.startswith("."):
                    self.active_skills.add(d.name.lower())

    def _categorize_pillar(self, path: Path) -> str:
        rel_str = str(path.relative_to(self.root)).replace("\\", "/")
        if "src/node" in rel_str or rel_str == "cstar.ts":
            return "Kernel (Node.js)"
        if "src/tools/pennyone" in rel_str or "hall_schema" in rel_str:
            return "Memory (PennyOne)"
        if ".agents/skills/" in rel_str:
            return "Woven Skills"
        if "src/core/engine/wardens" in rel_str:
            return "Enforcers (Wardens)"
        if "src/sentinel/" in rel_str and "wardens" not in rel_str:
            return "Legacy Daemons (Sentinels)"
        if "tests/" in rel_str:
            return "Tests (Linscott/Empire)"
        if "src/core/engine" in rel_str:
            return "Core Engine (Python)"
        return "General Subsystems"

    def _has_test(self, path: Path) -> bool:
        stem = path.stem
        if path.name.startswith("test_") or path.name.endswith(".test.ts"):
            return True
            
        test_names = [f"test_{stem}.py", f"test_{stem}.test.ts", f"test_{stem}_empire.py", f"test_{stem}.ts", f"{stem}.test.ts"]
        tests_dir = self.root / "tests"
        if not tests_dir.exists():
            return False
            
        for t_name in test_names:
            if list(tests_dir.rglob(t_name)):
                return True
        return False

    def run(self):
        SovereignHUD.persona_log("INFO", "LEVEL 5 DIAGNOSTIC: Scanning the Estate (Core Only)...")
        
        # Aggressive exclusion of non-core folders
        excludes = [
            ".venv", "node_modules", ".git", "__pycache__", "dist", "build", 
            "coverage", ".quarto", "skills_db", "docs", "bin", "site_libs",
            "quarto-html", "gogcli", "logs", ".stats", ".tmp", "docs/legacy_archive"
        ]
        
        # Only scan these core functional areas
        core_prefixes = ["src/", ".agents/skills/", "scripts/"]
        
        for ext in ["*.py", "*.ts", "*.js"]:
            for path in self.root.rglob(ext):
                rel_parts = path.relative_to(self.root).parts
                rel_str = str(path.relative_to(self.root)).replace("\\", "/")
                
                # Filter by exclusion list
                if any(ex in rel_parts for ex in excludes):
                    continue
                
                # Only include root files (like cstar.ts) or files in core prefixes
                is_core = any(rel_str.startswith(p) for p in core_prefixes) or len(rel_parts) == 1
                if not is_core:
                    continue
                
                self.stats["scanned"] += 1
                pillar = self._categorize_pillar(path)
                file_findings = []
                
                try:
                    content = path.read_text(encoding="utf-8")
                except Exception:
                    continue
                
                lines = len(content.splitlines())
                if lines > 400:
                    file_findings.append(f"File weight critical ({lines} lines).")
                    self.stats["complexity_warnings"] += 1
                    
                if pillar == "Legacy Daemons (Sentinels)":
                    base_name = path.stem.lower()
                    mapped_skill = "ravens" if base_name in ["muninn", "main_loop"] else base_name
                    if mapped_skill in self.active_skills:
                        file_findings.append(f"Legacy Drift: Daemon overlaps with `.agents/skills/{mapped_skill}`.")
                        self.stats["legacy_drift"] += 1

                if pillar != "Tests (Linscott/Empire)" and not path.name.startswith("test_") and not path.name.endswith(".d.ts"):
                    if not self._has_test(path):
                        file_findings.append("Linscott Breach: Missing 1:1 unit test.")
                        self.stats["linscott_breaches"] += 1

                for term in ["Hermes", "Python Dispatcher Monolith", "Phase 1"]:
                    if re.search(r'\b' + re.escape(term) + r'\b', content, re.IGNORECASE):
                        file_findings.append(f"Textual Rot: Mentions outdated concept '{term}'.")

                if file_findings:
                    self.findings.append({
                        "pillar": pillar,
                        "file": str(path.relative_to(self.root)),
                        "issues": file_findings
                    })

        SovereignHUD.box_top("LEVEL 5 SCAN COMPLETE")
        SovereignHUD.box_row("Files Scanned", str(self.stats["scanned"]))
        SovereignHUD.box_row("Legacy Drift", str(self.stats["legacy_drift"]), SovereignHUD.RED if self.stats["legacy_drift"] > 0 else SovereignHUD.GREEN)
        SovereignHUD.box_row("Linscott Breaches", str(self.stats["linscott_breaches"]), SovereignHUD.RED if self.stats["linscott_breaches"] > 0 else SovereignHUD.GREEN)
        SovereignHUD.box_bottom()
        
        out_path = self.root / "LEVEL_5_DIAGNOSTIC_FINDINGS.json"
        out_path.write_text(json.dumps(self.findings, indent=2), encoding="utf-8")
        SovereignHUD.persona_log("SUCCESS", f"Findings exported to {out_path.name}")
        
        # Handoff to Chant
        SovereignHUD.persona_log("INFO", "Handing off findings to the Chant Weave for research and proposal generation...")
        print("\nTo generate the implementation plan, run:")
        print(f"cstar chant \"Analyze the anomalies in {out_path.name}. Group the legacy drift issues into proposed beads using your research capabilities.\"")

def main():
    diag = Level5Diagnostic(PROJECT_ROOT)
    diag.run()

if __name__ == "__main__":
    main()
