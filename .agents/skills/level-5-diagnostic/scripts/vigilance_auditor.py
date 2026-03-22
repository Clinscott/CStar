"""
[VIGILANCE AUDITOR: AGGRESSIVE BATCH SWEEP]
Identity: ALFRED
Purpose: Refines Linscott Breaches into high-signal sectors. Prunes noise (tmp, skills_db, libs).
"""
import sys
import json
import time
import uuid
from pathlib import Path
from collections import defaultdict

# --- BOOTSTRAP ---
PROJECT_ROOT = Path(__file__).resolve().parents[4]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.sovereign_hud import SovereignHUD
from src.core.engine.hall_schema import HallOfRecords, HallBeadRecord, build_repo_id

def generate_bead_id(prefix: str) -> str:
    return f"bead:l5:vigilance:{prefix}:{uuid.uuid4().hex[:8]}"

class VigilanceAuditor:
    def __init__(self, root: Path):
        self.root = root
        self.findings_path = root / "LEVEL_5_DIAGNOSTIC_FINDINGS.json"
        self.db = HallOfRecords(root)
        self.repo_id = build_repo_id(root)

    def run(self):
        if not self.findings_path.exists():
            return

        with open(self.findings_path, "r") as f:
            findings = json.load(f)

        breached_files = [f for f in findings if any("Linscott Breach" in issue for issue in f.get("issues", []))]
        
        sectors = defaultdict(list)
        legacy_count = 0
        
        # Sector definitions (Priority ordered)
        sector_map = {
            "src/node/core/runtime": "node-runtime",
            "src/core/engine": "core-engine",
            ".agents/skills": "woven-skills",
            "src/tools/pennyone": "pennyone",
            "src/sentinel/wardens": "wardens",
            "src/node/core": "node-core",
            "src/core": "core-python",
            "src/tools": "system-tools",
            "scripts": "project-scripts"
        }

        functional_sectors = defaultdict(list)

        for item in breached_files:
            file_path_str = item["file"].replace("\\", "/")
            path = Path(file_path_str)
            
            # 1. Aggressive Noise Pruning (Categorize as LEGACY/PRUNABLE)
            is_noise = any(noise in file_path_str for noise in [
                "tmp_load_test", "skills_db", "site_libs", "quarto-html", 
                "tmp_diag", ".tmp", "docs/", "node_modules", ".venv",
                "bin/", "gogcli/", "logs/", ".stats/"
            ])
            
            if is_noise:
                legacy_count += 1
                continue

            # 2. Map to functional sector
            found_sector = "general-subsystems"
            for prefix, sector_id in sector_map.items():
                if file_path_str.startswith(prefix):
                    found_sector = sector_id
                    break
            
            functional_sectors[found_sector].append(file_path_str)

        SovereignHUD.box_top("AGGRESSIVE VIGILANCE SWEEP")
        SovereignHUD.box_row("Pruned Noise/Legacy", str(legacy_count), SovereignHUD.YELLOW)
        SovereignHUD.box_row("Functional Sectors", str(len(functional_sectors)), SovereignHUD.CYAN)
        SovereignHUD.box_bottom()

        # 3. Create Hierarchical Beads
        self.db.ensure_schema()
        bead_count = 0
        
        for sector_id, files in functional_sectors.items():
            # Create Parent Sector Bead
            parent_id = generate_bead_id(f"pb-{sector_id}")
            self.db.upsert_bead(HallBeadRecord(
                bead_id=parent_id,
                repo_id=self.repo_id,
                rationale=f"[Vigilance Sector]: Aggregate resolution of {len(files)} Linscott Breaches in {sector_id}.",
                created_at=int(time.time() * 1000),
                updated_at=int(time.time() * 1000),
                target_kind="SECTOR",
                target_path=sector_id,
                status="SET",
                source_kind="LEVEL_5_RESTORATION"
            ))
            bead_count += 1

            # Create Child Beads for the first few files or aggregate if too many
            # For this automation, we create 1 bead per file if files < 10, else 1 aggregate remediation bead.
            if len(files) <= 5:
                for f in files:
                    child_id = generate_bead_id(f"cb-{sector_id}")
                    self.db.upsert_bead(HallBeadRecord(
                        bead_id=child_id,
                        repo_id=self.repo_id,
                        rationale=f"Linscott Remediation: Implement 1:1 test for {f}.",
                        created_at=int(time.time() * 1000),
                        updated_at=int(time.time() * 1000),
                        target_kind="FILE",
                        target_path=str((self.root / f).resolve()),
                        status="SET",
                        source_kind="LEVEL_5_RESTORATION",
                        target_ref=parent_id
                    ))
                    bead_count += 1
            else:
                # Aggregate remediation for large sectors
                child_id = generate_bead_id(f"cb-agg-{sector_id}")
                self.db.upsert_bead(HallBeadRecord(
                    bead_id=child_id,
                    repo_id=self.repo_id,
                    rationale=f"Bulk Linscott Remediation: Execute testing sweep for {len(files)} files in {sector_id}.",
                    created_at=int(time.time() * 1000),
                    updated_at=int(time.time() * 1000),
                    target_kind="SECTOR",
                    target_path=sector_id,
                    status="SET",
                    source_kind="LEVEL_5_RESTORATION",
                    target_ref=parent_id
                ))
                bead_count += 1

        SovereignHUD.persona_log("SUCCESS", f"Injected {bead_count} high-signal vigilance beads into PennyOne.")

if __name__ == "__main__":
    VigilanceAuditor(PROJECT_ROOT).run()
