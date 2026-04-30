import argparse
import sys
import subprocess
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.personas import PersonaRegistry
from src.core.runtime_env import resolve_project_python

def main():
    parser = argparse.ArgumentParser(description="Persona Management: Enforce agent identity.")
    parser.add_argument("--set", help="Set the active persona (ODIN, ALFRED)")
    parser.add_argument("--enforce", action="store_true", help="Enforce persona policy")
    parser.add_argument("--retheme", action="store_true", help="Re-theme documentation")
    
    args = parser.parse_args()

    # Trigger Taliesin for high-fidelity voice work
    cstar_dispatcher = PROJECT_ROOT / "src" / "core" / "cstar_dispatcher.py"
    venv_python = resolve_project_python(PROJECT_ROOT)

    # Determine current persona from config
    import json
    config_path = PROJECT_ROOT / ".agents" / "config.json"
    persona_name = "ALFRED"
    if config_path.exists():
        data = json.loads(config_path.read_text(encoding='utf-8'))
        persona_name = data.get("system", {}).get("persona", "ALFRED")

    target_persona = args.set if args.set else persona_name
    strategy = PersonaRegistry.get_strategy(target_persona, PROJECT_ROOT)

    if args.set:
        strategy._sync_configs(args.set)
        
        # [🔱] SYNERGY: Trigger Taliesin for a stylized greeting
        try:
            cmd = [
                str(venv_python), str(cstar_dispatcher), "taliesin",
                "--refine",
                "--text", f"I have assumed the role of {args.set.upper()}. How may I serve the framework?",
                "--persona", args.set.upper()
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            print(result.stdout.strip())
        except Exception:
            print(f"[🔱] Persona set to: {args.set.upper()}")

    if args.enforce:
        context = strategy.enforce_policy()
        print(f"[🔱] Policy enforced. Breach status: {context.get('compliance_breach', False)}")

    if args.retheme:
        results = strategy.retheme_docs()
        for r in results:
            print(f"[🔱] {r}")

if __name__ == "__main__":
    main()
