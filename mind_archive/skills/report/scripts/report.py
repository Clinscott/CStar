import argparse
import sys
import subprocess
import json
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.report_engine import ReportEngine
from src.core.runtime_env import resolve_project_python

def main():
    parser = argparse.ArgumentParser(description="Persona Reporting: Generate stylized mission reports.")
    parser.add_argument("--title", required=True)
    parser.add_argument("--body", required=True)
    parser.add_argument("--status", default="INFO", choices=["INFO", "PASS", "FAIL", "WARN"])
    
    args = parser.parse_args()

    # Trigger One Mind for persona detection
    config_path = PROJECT_ROOT / ".agents" / "config.json"
    persona_name = "ALFRED"
    if config_path.exists():
        try:
            data = json.loads(config_path.read_text(encoding='utf-8'))
            persona_name = data.get("system", {}).get("persona", "ALFRED")
        except Exception: pass

    # [🔱] SYNERGY: Trigger Taliesin to refine the report body
    cstar_dispatcher = PROJECT_ROOT / "src" / "core" / "cstar_dispatcher.py"
    venv_python = resolve_project_python(PROJECT_ROOT)

    refined_body = args.body
    try:
        cmd = [
            str(venv_python), str(cstar_dispatcher), "taliesin",
            "--refine",
            "--text", args.body,
            "--persona", persona_name
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        refined_body = result.stdout.strip()
    except Exception:
        pass

    engine = ReportEngine(PROJECT_ROOT)
    report = engine.generate_report(args.title, refined_body, args.status)
    print(report)

if __name__ == "__main__":
    main()
