import argparse
import sys
import json
import subprocess
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

def main():
    parser = argparse.ArgumentParser(description="Sterling Compliance: Audit sectors for Sovereignty.")
    parser.add_argument("--files", nargs="+", required=True, help="List of file paths to audit.")
    args = parser.parse_args()

    auditor_path = PROJECT_ROOT / "src" / "core" / "sterling_auditor.py"
    venv_python = PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"

    if not auditor_path.exists():
        print(f"[ALFRED]: CRITICAL - Sterling Auditor missing at {auditor_path}", file=sys.stderr)
        sys.exit(1)

    try:
        # Trigger the internal auditor
        result = subprocess.run(
            [str(venv_python), str(auditor_path), *args.files],
            capture_output=True,
            text=True,
            check=True
        )
        
        # Parse the JSON results for a cleaner CLI presentation
        results = json.loads(result.stdout)
        print('[ALFRED]: "Sterling Compliance Report:"\n')
        
        for r in results:
            status_emoji = '🛡️' if r['status'] == 'SILVER' else ('✨' if r['status'] == 'POLISHED' else '⚠️')
            print(f"{status_emoji} **{r['file']}** [{r['status']} - {r['compliance_score']:.0f}%]")
            print(f"   - Tier 1 (Lore): {r['tiers']['tier1_lore']['status']}")
            print(f"   - Tier 2 (Isolation): {r['tiers']['tier2_isolation']['status']}")
            print(f"   - Tier 3 (Audit): {r['tiers']['tier3_audit']['status']}\n")

        if all(r['status'] == 'SILVER' for r in results):
            print('[ALFRED]: "The silver is pure, Master. Sovereignty confirmed."')
        else:
            print('[ALFRED]: "The blade requires further polishing, sir. Gaps identified in the triad."')

    except Exception as e:
        print(f"Sterling Audit Failed: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
