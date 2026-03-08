import argparse
import sys
import subprocess
import json
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

def main():
    parser = argparse.ArgumentParser(description="Gungnir Oracle: High-fidelity intelligence.")
    parser.add_argument("--query", required=True, help="The natural language query.")
    parser.add_argument("--system_prompt", help="Override the default system prompt.")
    args = parser.parse_args()

    # [🔱] THE SYNAPTIC ASCENSION
    # We trigger the MCP server's 'think' tool which uses Host Sampling.
    # No API Keys required.
    
    try:
        # We use node to call the MCP client directly or use a helper
        # For simplicity in this conduit, we trigger the 'one-mind' skill logic
        # which we will now also refactor to use sampling.
        
        cstar_dispatcher = PROJECT_ROOT / "src" / "core" / "cstar_dispatcher.py"
        venv_python = PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
        if not venv_python.exists(): venv_python = Path(sys.executable)

        cmd = [
            str(venv_python), str(cstar_dispatcher), "one-mind",
            "--prompt", args.query
        ]
        if args.system_prompt:
            cmd.extend(["--system_prompt", args.system_prompt])
            
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, encoding='utf-8')
        print(result.stdout.strip())

    except Exception as e:
        print(f"Oracle failed: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
