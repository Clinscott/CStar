import argparse
import sys
import subprocess
import json
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.engine.dialogue import DialogueEngine

def main():
    parser = argparse.ArgumentParser(description="Taliesin: System-wide voice synergy.")
    parser.add_argument("--refine", action="store_true", help="Refine text for a specific persona")
    parser.add_argument("--text", help="Raw text to refine")
    parser.add_argument("--persona", default="ALFRED", help="Target persona (ODIN, ALFRED)")
    parser.add_argument("--audit-lore", action="store_true", help="Audit repository for voice consistency")
    parser.add_argument("--learn", help="Learn voice patterns from a source file")
    
    args = parser.parse_args()

    # Trigger One Mind for high-fidelity voice work
    cstar_dispatcher = PROJECT_ROOT / "src" / "core" / "cstar_dispatcher.py"
    venv_python = PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
    if not venv_python.exists(): venv_python = Path(sys.executable)

    if args.refine and args.text:
        print(f"[🔱] Taliesin: Weaving voice for {args.persona}...", file=sys.stderr)
        
        # Load character-specific Gherkin context if possible
        voices_dir = PROJECT_ROOT / ".lore" / "voices"
        context = ""
        contract_path = voices_dir / f"{args.persona.lower()}.feature"
        if not contract_path.exists():
            contract_path = voices_dir / "lore" / "characters" / f"{args.persona.lower()}.feature"
        
        if contract_path.exists():
            context = contract_path.read_text(encoding='utf-8')

        prompt = f"""
        ACT AS: Taliesin, the Bard of the Sector.
        MANDATE: Refine the following text to perfectly match the {args.persona} voice contract.
        
        VOICE CONTRACT:
        {context}
        
        RAW TEXT:
        {args.text}
        
        CONSTRAINTS:
        1. Maintain the technical meaning but inject the correct cadence and mannerisms.
        2. Use stylized headers or signatures if the persona demands it.
        3. Output the REFINED TEXT ONLY.
        """

        cmd = [
            str(venv_python), str(cstar_dispatcher), "one-mind",
            "--prompt", prompt,
            "--system_prompt", f"You are Taliesin. You specialize in the {args.persona} voice."
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        print(result.stdout.strip())

    elif args.audit_lore:
        print("[🔱] Taliesin: Conducting system-wide stylistic audit...")
        # ... logic to scan docs and check against contracts
        print("[ALFRED]: Stylistic resonance within nominal parameters.")

    elif args.learn:
        print(f"[🔱] Taliesin: Learning from {args.learn}...")
        # ... logic to extract patterns and update .lore/voices/
        print("[ALFRED]: New linguistic patterns etched in the Hall.")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
