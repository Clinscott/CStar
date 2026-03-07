import argparse
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.personas import PersonaRegistry

def main():
    parser = argparse.ArgumentParser(description="Persona Management: Enforce agent identity.")
    parser.add_argument("--set", help="Set the active persona (ODIN, ALFRED)")
    parser.add_argument("--enforce", action="store_true", help="Enforce persona policy")
    parser.add_argument("--retheme", action="store_true", help="Re-theme documentation")
    
    args = parser.parse_args()

    # Determine current persona from config
    import json
    config_path = PROJECT_ROOT / ".agents" / "config.json"
    persona_name = "ALFRED"
    if config_path.exists():
        data = json.loads(config_path.read_text(encoding='utf-8'))
        persona_name = data.get("system", {}).get("persona", "ALFRED")

    strategy = PersonaRegistry.get_strategy(args.set if args.set else persona_name, PROJECT_ROOT)

    if args.set:
        strategy._sync_configs(args.set)
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
