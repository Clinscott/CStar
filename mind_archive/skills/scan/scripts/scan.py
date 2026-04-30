import argparse
import sys
import subprocess
import hashlib
import json
import sqlite3
import time
import re
import asyncio
from pathlib import Path
from typing import Any, List, Dict, Tuple

# [Ω] RE-ROOTING
PROJECT_ROOT = Path(__file__).resolve().parents[4]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

try:
    from src.core.engine.gungnir.universal import UniversalGungnir
    from src.core.engine.atomic_gpt import AnomalyWarden
    from src.core.sovereign_hud import SovereignHUD
except ImportError as e:
    print(f"CRITICAL ERROR: Failed to import Gungnir modules: {e}", file=sys.stderr)
    # We continue with reduced capability if HUD is missing for some reason
    class SovereignHUD:
        @staticmethod
        def persona_log(p, m): print(f"[{p}] {m}")

class PennyOneScanner:
    """
    [Ω] The Python Scryer.
    Structural indexer implementing the authoritative Gungnir Decalogue.
    """
    def __init__(self, force: bool = False, mock: bool = False):
        self.force = force
        self.mock = mock
        self.gungnir = UniversalGungnir()
        self.warden = AnomalyWarden()
        self.stats_dir = PROJECT_ROOT / ".stats"
        self.stats_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.stats_dir / "pennyone.db"
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(str(self.db_path))
        conn.execute('''
            CREATE VIRTUAL TABLE IF NOT EXISTS intents_fts USING fts5(
                path, intent, interaction_protocol, tokenize='porter unicode61'
            )
        ''')
        # Ensure metadata table exists for gungnir scores
        conn.execute('''
            CREATE TABLE IF NOT EXISTS sector_metadata (
                path TEXT PRIMARY KEY,
                hash TEXT,
                overall_score REAL,
                logic REAL, style REAL, intel REAL,
                gravity REAL, vigil REAL, stability REAL,
                coupling REAL, aesthetic REAL, anomaly REAL,
                sovereignty REAL,
                last_scanned TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()
        conn.close()

    def _get_vigil_score(self, file_path: Path) -> float:
        """Verifies existence of .feature contract and unit test."""
        score = 0.0
        stem = file_path.stem
        # 1. Lore Check
        contract_path = PROJECT_ROOT / ".agents" / "skills" / stem / f"{stem}.feature"
        if contract_path.exists(): score += 5.0
        # 2. Isolation Check
        test_path = PROJECT_ROOT / "tests" / "unit" / f"test_{stem}.py"
        if test_path.exists(): score += 5.0
        return score

    def _get_gravity_score(self, rel_path: str) -> float:
        """Heuristic gravity score based on file importance."""
        # In a full run, this would query gravity.db
        if "core" in rel_path: return 8.0
        if "engine" in rel_path: return 9.0
        return 5.0

    def calculate_metrics(self, code: str, rel_path: str, ext: str) -> Dict[str, float]:
        """[Ω] Calculates the full Gungnir Decalogue."""
        breaches = self.gungnir.audit_logic(code, ext)
        
        # 1. Logic [L]: 10 - (complexity breaches)
        logic_breaches = [b for b in breaches if "LOGIC" in b['action']]
        logic = max(1.0, 10.0 - (len(logic_breaches) * 2))
        
        # 2. Style [S]: 10 - (style breaches)
        style_breaches = [b for b in breaches if "STYLE" in b['action']]
        style = max(1.0, 10.0 - (len(style_breaches) * 1.5))
        
        # 3. Intel [I]: Documentation ratio
        intel_breaches = [b for b in breaches if "INTEL" in b['action']]
        intel = max(1.0, 10.0 - (len(intel_breaches) * 2))
        
        # 4. Gravity [G]
        gravity = self._get_gravity_score(rel_path)
        
        # 5. Vigil [V]
        vigil = self._get_vigil_score(PROJECT_ROOT / rel_path)
        
        # 6. Stability [T]
        import radon.complexity as cc
        try:
            results = cc.cc_visit(code)
            avg_cc = sum(r.complexity for r in results) / len(results) if results else 1
            stability = max(0.1, 1.0 - (avg_cc / 50.0)) * 10 # Scale to 10
        except Exception: stability = 5.0
        
        # 7. Coupling [C]
        import ast
        try:
            tree = ast.parse(code)
            imports = [node for node in ast.walk(tree) if isinstance(node, (ast.Import, ast.ImportFrom))]
            coupling = max(1.0, 10.0 - (len(imports) / 2)) # Penalty for > 10
        except Exception: coupling = 5.0
        
        # 8. Aesthetic [E]
        aesthetic = (logic + style + intel) / 3
        
        # 9. Anomaly [A]
        # [latency, tokens, loops, errors, lore_alignment]
        anomaly_prob = self.warden.forward([100.0, len(code.split()), avg_cc, 0.0, 1.0])
        anomaly = (1.0 - anomaly_prob) * 10
        
        # 10. Sovereignty [Ω]
        overall = (aesthetic * 0.4) + (stability * 0.2) + (vigil * 0.2) + (anomaly * 0.2)
        if vigil < 5.0 and gravity > 7.0: overall = min(overall, 5.0) # Sterling Penalty
        
        sovereignty = 1.0 if overall >= 8.5 and vigil >= 5.0 else (overall / 10.0)

        return {
            "logic": logic, "style": style, "intel": intel,
            "gravity": gravity, "vigil": vigil, "stability": stability,
            "coupling": coupling, "aesthetic": aesthetic, "anomaly": anomaly,
            "overall": overall, "sovereignty": sovereignty
        }

    def write_qmd(self, rel_path: str, metrics: Dict[str, float], intent: str, interaction: str):
        """Generates the authoritative QMD record in .stats/"""
        flattened = rel_path.replace("/", "-").replace("\\", "-").replace(".", "-")
        qmd_path = self.stats_dir / f"{flattened}.qmd"
        
        content = f"""---
title: "{Path(rel_path).name}"
path: "{rel_path}"
overall_score: {metrics['overall']:.2f}
logic_score: {metrics['logic']:.2f}
style_score: {metrics['style']:.2f}
intel_score: {metrics['intel']:.2f}
---

## Intent
{intent}

## Interaction Protocol
{interaction}

## Gungnir Matrix Breakdown
- **Logic [L]**: {metrics['logic']:.1f}/10
- **Style [S]**: {metrics['style']:.1f}/10
- **Intel [I]**: {metrics['intel']:.1f}/10
- **Gravity [G]**: {metrics['gravity']:.1f}/10
- **Vigil [V]**: {metrics['vigil']:.1f}/10
- **Stability [T]**: {metrics['stability']:.1f}/10
- **Coupling [C]**: {metrics['coupling']:.1f}/10
- **Aesthetic [E]**: {metrics['aesthetic']:.1f}/10
- **Anomaly [A]**: {metrics['anomaly']:.1f}/10
- **Sovereignty [Ω]**: {metrics['sovereignty']:.2f}/1.0

## Neural Pathways
Sector scoured and verified by the One Mind.
"""
        qmd_path.write_text(content, encoding='utf-8')

    async def scan_file(self, file_path: Path) -> bool:
        """Surgically scans a single file and updates its records."""
        file_path = file_path.resolve()
        project_root_resolved = PROJECT_ROOT.resolve()
        
        try:
            rel_path = file_path.relative_to(project_root_resolved).as_posix()
            content = file_path.read_text(encoding='utf-8')
            current_hash = hashlib.md5(content.encode('utf-8')).hexdigest()
            
            # 1. Calculate Metrics
            metrics = self.calculate_metrics(content, rel_path, file_path.suffix)
            
            # 2. Generate Intent (Native)
            if self.mock:
                intent, interaction = f"Mock intent for {file_path.name}", "Standard interaction."
            else:
                # [🔱] THE SYNAPTIC STRIKE: Host Agent session handles this
                prompt = f"Analyze this sector: {rel_path}\\n\\nCODE:\\n{content[:1000]}"
                from src.core.mimir_client import mimir
                raw = await mimir.think(prompt)
                intent, interaction = "Analyzed.", "Verified." # Placeholders for raw parsing
            
            # 3. Write Hall of Records
            self.write_qmd(rel_path, metrics, intent, interaction)
            
            # 4. Update DB
            conn = sqlite3.connect(str(self.db_path))
            conn.execute('''
                INSERT INTO sector_metadata (path, hash, overall_score, logic, style, intel, gravity, vigil, stability, coupling, aesthetic, anomaly, sovereignty)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(path) DO UPDATE SET 
                    overall_score=excluded.overall_score,
                    logic=excluded.logic, style=excluded.style, intel=excluded.intel,
                    vigil=excluded.vigil, sovereignty=excluded.sovereignty,
                    last_scanned=CURRENT_TIMESTAMP
            ''', (rel_path, current_hash, metrics['overall'], metrics['logic'], metrics['style'], metrics['intel'], 
                  metrics['gravity'], metrics['vigil'], metrics['stability'], metrics['coupling'], metrics['aesthetic'], 
                  metrics['anomaly'], metrics['sovereignty']))
            
            conn.execute('DELETE FROM intents_fts WHERE path = ?', (rel_path,))
            conn.execute('INSERT INTO intents_fts (path, intent, interaction_protocol) VALUES (?, ?, ?)', (rel_path, intent, interaction))
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f" [!] Failed: {rel_path}: {e}", file=sys.stderr)
            return False

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", help="Surgically scan one file")
    parser.add_argument("--path", default="src", help="Root path to scan")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--mock", action="store_true", default=True) # Default to mock for safety in loop
    args = parser.parse_args()

    scanner = PennyOneScanner(force=args.force, mock=args.mock)
    
    if args.file:
        await scanner.scan_file(Path(args.file))
    else:
        # Full scan...
        print(f"◤ INITIATING SYSTEM SCAN -> {args.path} ◢")
        # Simplified crawl for now
        for p in Path(args.path).rglob("*.py"):
            if ".venv" in str(p) or "__pycache__" in str(p): continue
            print(f" ◈ Scrying: {p.name}")
            await scanner.scan_file(p)

if __name__ == "__main__":
    asyncio.run(main())
