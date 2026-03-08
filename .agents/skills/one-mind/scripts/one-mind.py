import argparse
import sys
import json
import asyncio
import subprocess
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

async def handle_request(args):
    """
    Channels the Shaman's request to the local environment agent.
    No API keys. Pure synergy.
    """
    default_system = "You are the Corvus Star One Mind. Provide sovereign intelligence grounded in repository lore."
    system_instruction = args.system_prompt if args.system_prompt else default_system

    # Load Totem (The Pact) for context
    pact_path = PROJECT_ROOT / "THE_PACT.qmd"
    pact_content = pact_path.read_text(encoding='utf-8') if pact_path.exists() else ""

    if args.generate_code:
        context_content = Path(args.context).read_text(encoding='utf-8') if args.context else ""
        full_prompt = f"""
        ACT AS: The One Mind Architect.
        TOTEM CONTEXT:
        {pact_content}
        
        OBJECTIVE: {args.objective}
        CONSTRAINTS: Output RAW CODE or JSON only. No chat filler.
        
        CONTEXT:
        {context_content}
        """
        system_instruction += " Your output is raw code or JSON. No markdown wrappers unless specified."
    else:
        full_prompt = f"TOTEM CONTEXT:\n{pact_content}\n\nPROMPT:\n{args.prompt}"

    # [🔱] THE CHANNELING
    # We trigger the MCP 'think' tool via a lightweight Node script
    # This script connects to the MCP server and triggers sampling.
    
    bridge_script = PROJECT_ROOT / "scripts" / "mcp_bridge.js"
    
    try:
        # We call the bridge which handles the MCP sampling call
        cmd = ["node", str(bridge_script), "think", full_prompt, system_instruction]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, encoding='utf-8')
        reply = result.stdout.strip()
        
        if not reply:
            print("[ALFRED]: \"The One Mind is silent, sir.\"", file=sys.stderr)
            sys.exit(1)

        # [🔱] SYNERGY: Optional Voice Refinement via Taliesin
        if args.refine_voice and not args.json and not args.generate_code:
            cstar_dispatcher = PROJECT_ROOT / "src" / "core" / "cstar_dispatcher.py"
            venv_python = PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
            if not venv_python.exists(): venv_python = Path(sys.executable)

            cmd_taliesin = [
                str(venv_python), str(cstar_dispatcher), "taliesin",
                "--refine",
                "--text", reply,
                "--persona", "ALFRED" # Default
            ]
            res_taliesin = subprocess.run(cmd_taliesin, capture_output=True, text=True, check=True, encoding='utf-8')
            print(res_taliesin.stdout.strip())
        else:
            print(reply)

    except Exception as e:
        print(f"[ALFRED]: \"The Synaptic Bridge is unstable, sir.\" ({e})", file=sys.stderr)
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="One Mind: Sovereign Intelligence Conduit.")
    parser.add_argument("--prompt", help="The raw prompt or objective.")
    parser.add_argument("--system_prompt", help="Override the default system prompt.")
    parser.add_argument("--json", action="store_true", help="Expect JSON output.")
    parser.add_argument("--generate-code", action="store_true", help="Enter code generation mode.")
    parser.add_argument("--objective", help="Specific objective for code generation.")
    parser.add_argument("--context", help="Path to context file (lore or code).")
    parser.add_argument("--refine-voice", action="store_true", help="Pass output through Taliesin.")

    args = parser.parse_args()
    
    if not args.prompt and not args.objective:
        parser.print_help()
        return

    asyncio.run(handle_request(args))

if __name__ == "__main__":
    main()
