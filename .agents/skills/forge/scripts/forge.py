import argparse
import json
import os
import sys
import subprocess
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

def main():
    parser = argparse.ArgumentParser(description="Taliesin Forge: Weave code from lore.")
    parser.add_argument("--lore", required=True, help="Relative path to the lore file.")
    parser.add_argument("--objective", help="Optional objective override.")
    args = parser.parse_args()

    lore_path = PROJECT_ROOT / args.lore
    if not lore_path.exists():
        print(f"[ALFRED]: CRITICAL - Lore missing at {lore_path}")
        sys.exit(1)

    # Trigger One Mind Skill via Dispatcher
    cstar_dispatcher = PROJECT_ROOT / "src" / "core" / "cstar_dispatcher.py"
    venv_python = PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
    if not venv_python.exists(): venv_python = Path(sys.executable)

    print(f"[Ω] Forge: Requesting materialization from the One Mind...", file=sys.stderr)
    
    try:
        # Use 'one-mind' skill for the direct strike
        cmd = [
            str(venv_python), str(cstar_dispatcher), "one-mind",
            "--generate-code",
            "--objective", args.objective if args.objective else "Materialize the lore.",
            "--context", str(lore_path),
            "--json"
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        raw = result.stdout

        # Handle possible markdown noise from the skill output
        clean_json = raw.strip()
        if "```json" in clean_json:
            clean_json = clean_json.split("```json")[1].split("```")[0].strip()
        elif "```" in clean_json:
            clean_json = clean_json.split("```")[1].split("```")[0].strip()
        
        # Ensure we find the JSON object if there's surrounding text
        if "{" in clean_json and "}" in clean_json:
            clean_json = clean_json[clean_json.find("{"):clean_json.lastIndexOf("}")+1]

        data = json.loads(clean_json)

        if not data.get("target_path") or not data.get("code"):
            raise ValueError("One Mind provided incomplete artifact data.")

        staged_dir = PROJECT_ROOT / ".agents" / "forge_staged"
        staged_dir.mkdir(parents=True, exist_ok=True)
        
        artifact_name = Path(data["target_path"]).name
        stage_path = staged_dir / artifact_name
        stage_path.write_text(data["code"], encoding='utf-8')

        print(f"[🔱] Artifact forged successfully: {data['target_path']}")
        print(f"[ALFRED]: Staged for review at .agents/forge_staged/{artifact_name}")

    except Exception as e:
        print(f"Forge failed: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
