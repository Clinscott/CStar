"""
[🛡️] Sterling Compliance Auditor
Lore: "A tarnished blade is a liability. Alfred's watch ensures only silver remains."
Purpose: Audits a file path for compliance with the 3-tiered Sterling Mandate.
"""

import os
import sys
import json
from pathlib import Path
from typing import Any

class SterlingAuditor:
    """Orchestrates the verification of the Sterling Mandate Triad."""

    def __init__(self, root_path: Path):
        self.root = root_path
        self.features_dir = self.root / "tests" / "features"
        self.unit_dir_py = self.root / "tests" / "unit"
        self.unit_dir_ts = self.root / "tests" / "node"

    def audit_file(self, file_path: str) -> dict[str, Any]:
        """Performs a multi-tiered audit on a single source file."""
        abs_path = Path(file_path).resolve()
        if not abs_path.exists():
            return {"error": f"File not found: {file_path}"}

        rel_path = abs_path.relative_to(self.root)
        is_ts = abs_path.suffix in [".ts", ".tsx"]
        is_py = abs_path.suffix == ".py"

        report = {
            "file": str(rel_path),
            "tiers": {
                "tier1_lore": {"status": "MISSING", "path": None},
                "tier2_isolation": {"status": "MISSING", "path": None},
                "tier3_audit": {"status": "UNVERIFIED", "path": None}
            },
            "compliance_score": 0.0,
            "status": "TARNISHED"
        }

        # --- TIER 1: LORE (Gherkin Feature) ---
        # Look for a .feature file matching the name or directory
        feature_name = abs_path.stem + ".feature"
        # Also check for group features (e.g. core.feature for all core files)
        possible_features = list(self.features_dir.glob(f"**/{feature_name}"))
        if not possible_features:
            # Check directory-based features
            parent_name = abs_path.parent.name
            possible_features = list(self.features_dir.glob(f"**/{parent_name}.feature"))

        if possible_features:
            report["tiers"]["tier1_lore"]["status"] = "SILVER"
            report["tiers"]["tier1_lore"]["path"] = str(possible_features[0].relative_to(self.root))

        # --- TIER 2: ISOLATION (Unit Test) ---
        if is_py:
            test_name = f"test_{abs_path.stem}.py"
            # Check recursive unit dir
            possible_tests = list(self.unit_dir_py.glob(f"**/{test_name}"))
            # Fallback to root tests dir for legacy
            if not possible_tests:
                possible_tests = list((self.root / "tests").glob(test_name))
        elif is_ts:
            # Support both .test.ts and .ts (if in tests/node)
            test_name = abs_path.stem + ".test.ts"
            possible_tests = list(self.unit_dir_ts.glob(f"**/{test_name}"))
            if not possible_tests:
                possible_tests = list(self.unit_dir_ts.glob(f"**/{abs_path.name}"))
        else:
            possible_tests = []

        if possible_tests:
            report["tiers"]["tier2_isolation"]["status"] = "SILVER"
            report["tiers"]["tier2_isolation"]["path"] = str(possible_tests[0].relative_to(self.root))

        # --- TIER 3: AUDIT (Empire/Gauntlet) ---
        # Tier 3 is usually system-wide or integration, so we check if the file is mentioned in any empire test
        empire_dir = self.root / "tests" / "empire_tests"
        if empire_dir.exists():
            # Heuristic: search empire tests for the filename
            for empire_test in empire_dir.glob("*.py"):
                try:
                    if abs_path.name in empire_test.read_text(encoding="utf-8"):
                        report["tiers"]["tier3_audit"]["status"] = "SILVER"
                        report["tiers"]["tier3_audit"]["path"] = str(empire_test.relative_to(self.root))
                        break
                except: pass

        # --- CALCULUS ---
        silver_count = sum(1 for t in report["tiers"].values() if t["status"] == "SILVER")
        report["compliance_score"] = (silver_count / 3.0) * 100.0
        
        if report["compliance_score"] >= 100.0:
            report["status"] = "SILVER"
        elif report["compliance_score"] >= 66.0:
            report["status"] = "POLISHED"
        
        return report

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided."}))
        sys.exit(1)

    root = Path(__file__).resolve().parents[2]
    auditor = SterlingAuditor(root)
    
    results = []
    for path in sys.argv[1:]:
        results.append(auditor.audit_file(path))
    
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
