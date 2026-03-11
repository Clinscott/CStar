import os
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List

# [Ω] RE-ROOTING: Absolute path from script to root
PROJECT_ROOT = Path(__file__).resolve().parents[4]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

STATE_DIR = PROJECT_ROOT / ".agents" / "skills" / "chronicle"
STATE_MAP_PATH = STATE_DIR / "state_map.json"

try:
    from src.core.engine.gungnir.universal import UniversalGungnir
except ImportError:
    UniversalGungnir = None

class StateScrutinizer:
    def __init__(self):
        self.state_map = {
            "sectors": {},
            "skills": {},
            "compliance": {
                "contract_coverage": 0.0,
                "documentation_integrity": 0.0,
                "total_drift": 0.0
            }
        }
        self.gungnir = UniversalGungnir() if UniversalGungnir else None

    def _extract_metadata(self, file_path: Path) -> Dict[str, Any]:
        metadata = {
            "intent": "Unknown",
            "imports": [],
            "exports": [],
            "gungnir_score": 0.0,
            "breaches": []
        }
        
        try:
            content = file_path.read_text(encoding='utf-8')
            
            # 1. Logic/Style/Intel/Stability/Coupling
            if self.gungnir:
                metadata["breaches"] = self.gungnir.audit_logic(content, file_path.suffix)
            
            # 2. Vigil [V]: Check for Gherkin Contract
            # Heuristic: Match stem against skill directory
            contract_found = False
            skills_dir = PROJECT_ROOT / ".agents" / "skills"
            if skills_dir.exists():
                for d in skills_dir.iterdir():
                    if d.is_dir() and d.name.lower() in file_path.stem.lower():
                        if list(d.glob("*.feature")):
                            contract_found = True
                            break
            
            if not contract_found:
                metadata["breaches"].append({
                    "severity": "MEDIUM",
                    "action": "GUNGNIR_VIGIL_BREACH: No Gherkin behavioral contract found."
                })

            # 3. Calculate Final Gungnir Score
            metadata["gungnir_score"] = max(0, 100 - (len(metadata["breaches"]) * 5))
            
            # 4. Extract Intent...
            intent_match = re.search(r'# Intent:\s*(.*)', content)
            if intent_match: 
                metadata["intent"] = intent_match.group(1).strip()
            elif file_path.suffix in [".py", ".ts"]:
                # Try docstring
                doc_match = re.search(r'"""(.*?)"""', content, re.DOTALL)
                if doc_match: metadata["intent"] = doc_match.group(1).strip().split('\n')[0]

            # 3. Extract imports/exports
            if file_path.suffix == ".py":
                metadata["imports"] = re.findall(r'^import (.*)|^from (.*) import', content, re.MULTILINE)
                metadata["exports"] = re.findall(r'^def (.*)\(|^class (.*):', content, re.MULTILINE)
            else:
                metadata["imports"] = re.findall(r'^import .* from (.*)', content, re.MULTILINE)
                metadata["exports"] = re.findall(r'^export (?:class|function|const) (.*?)(?:\s|\()', content, re.MULTILINE)
        except Exception:
            pass
                
        return metadata

    def scan_system(self, target_file: str | None = None):
        if target_file:
            print(f"◤ CHRONICLE: SURGICAL SCRUTINY -> {target_file} ◢")
            # Load existing state to update in-place
            if STATE_MAP_PATH.exists():
                try:
                    self.state_map = json.loads(STATE_MAP_PATH.read_text())
                except Exception: pass
            
            path = PROJECT_ROOT / target_file
            if path.exists():
                self.state_map["sectors"][target_file] = self._extract_metadata(path)
        else:
            print("◤ CHRONICLE: INITIATING DEEP SYSTEM SCRUTINY ◢")
            # 1. Scan Sectors (Source Code)
            for root, dirs, files in os.walk(PROJECT_ROOT / "src"):
                if any(d in root for d in [".venv", "__pycache__", "node_modules"]): continue
                for f in files:
                    if f.endswith((".py", ".ts", ".tsx")):
                        path = Path(root) / f
                        rel_path = str(path.relative_to(PROJECT_ROOT))
                        self.state_map["sectors"][rel_path] = self._extract_metadata(path)

        # 2. Scan Skills & Contracts
        # ... existing skills scan logic ...

        # 3. Calculate Compliance
        total_skills = len(self.state_map["skills"])
        if total_skills > 0:
            skills_with_contracts = sum(1 for s in self.state_map["skills"].values() if s["has_contract"])
            self.state_map["compliance"]["contract_coverage"] = (skills_with_contracts / total_skills) * 100

        # 4. Finalize & Save
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        STATE_MAP_PATH.write_text(json.dumps(self.state_map, indent=2))
        print(f"  ◈ Compliance: {self.state_map['compliance']['contract_coverage']:.1f}% Contract Coverage")
        print(f"  ◈ Hall of Records: state_map.json crystallized.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", help="Target specific file for surgical scan")
    args = parser.parse_args()
    
    scrutinizer = StateScrutinizer()
    scrutinizer.scan_system(target_file=args.file)
