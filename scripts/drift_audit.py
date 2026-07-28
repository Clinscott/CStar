import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SKILLS_DIR = PROJECT_ROOT / ".agents" / "skills"
SRC_DIR = PROJECT_ROOT / "src"
REPORT_PATH = PROJECT_ROOT / "docs" / "reports" / "DRIFT_REPORT.qmd"

try:
    from src.core.engine.gungnir.schema import is_canonical_gungnir_score
    from src.core.engine.gungnir.universal import UniversalGungnir
except ImportError:
    is_canonical_gungnir_score = None
    UniversalGungnir = None

class DriftAuditor:
    """
    [Ω] The Drift Auditor.
    Identifies 'Ghost Logic' and calculates Gungnir scores for uncontracted files.
    """
    def __init__(self):
        self.gungnir = UniversalGungnir() if UniversalGungnir else None
        self.ghost_files = []

    def _score_file(self, file_path: Path) -> tuple[float, int]:
        if self.gungnir is None:
            return 0.0, 0

        try:
            code = file_path.read_text(encoding="utf-8")
            breaches = self.gungnir.audit_logic(code, file_path.suffix)
            matrix = self.gungnir.score_matrix(code, file_path.suffix)
            score = float(matrix["overall"])
            if (
                is_canonical_gungnir_score is None
                or not is_canonical_gungnir_score(score)
            ):
                raise ValueError("Drift Audit received a non-canonical Gungnir score")
        except (KeyError, OSError, SyntaxError, TypeError, ValueError):
            return 0.0, 0

        return score, len(breaches)

    def run_audit(self):
        print("◤ INITIATING SYSTEM DRIFT AUDIT ◢")
        
        # 1. Get all skills (contracts)
        skill_names = set()
        if SKILLS_DIR.exists():
            for d in SKILLS_DIR.iterdir():
                if d.is_dir():
                    # Check if it has a .feature file
                    if list(d.glob("*.feature")):
                        skill_names.add(d.name.lower())

        # 2. Scan src/ for files without contracts
        for root, _dirs, files in os.walk(SRC_DIR):
            if any(d in root for d in [".venv", "__pycache__", "node_modules", "dist"]):
                continue
            
            for f in files:
                if f.endswith((".py", ".ts", ".tsx")):
                    file_path = Path(root) / f
                    rel_path = str(file_path.relative_to(PROJECT_ROOT))
                    
                    # Heuristic: does the filename (stem) match a skill name?
                    if file_path.stem.lower() not in skill_names:
                        score, breach_count = self._score_file(file_path)
                        
                        self.ghost_files.append({
                            "path": rel_path,
                            "score": score,
                            "breaches": breach_count
                        })

        self._generate_report()

    def _generate_report(self):
        REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
        
        lines = [
            "---",
            "title: \"System Drift Report: Ghost Logic Audit\"",
            "subtitle: \"Verification of the Sterling Mandate\"",
            "format: html",
            "---",
            "",
            "# ◤ SYSTEM DRIFT REPORT ◢",
            "",
            "> [!IMPORTANT]",
            "> **GHOST LOGIC**: Source files that lack a corresponding Gherkin `.feature` contract in `.agents/skills/`.",
            "",
            "## ◈ Summary",
            f"- **Ghost Files Detected**: {len(self.ghost_files)}",
            f"- **System Coverage**: {((1 - len(self.ghost_files)/100)*100):.1f}% (Estimated)", # Placeholder
            "",
            "## ◈ Ghost Logic Registry",
            "| File Path | Gungnir Ω | Breaches |",
            "| :--- | :---: | :---: |"
        ]
        
        # Sort by lowest score
        self.ghost_files.sort(key=lambda x: x["score"])
        
        for gf in self.ghost_files:
            lines.append(f"| `{gf['path']}` | {gf['score']:.1f} | {gf['breaches']} |")
            
        lines.append("")
        lines.append("---")
        lines.append("> *\"Complexity is the enemy of execution. Excellence is the habit of small corrections.\"*")
        
        REPORT_PATH.write_text("\n".join(lines), encoding='utf-8')
        print(f"  ◈ Audit Complete. Report crystallized at {REPORT_PATH}")

if __name__ == "__main__":
    auditor = DriftAuditor()
    auditor.run_audit()
