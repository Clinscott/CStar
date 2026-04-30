import subprocess
import sys
from pathlib import Path

from src.core.runtime_env import resolve_project_python


def resolve() -> None:
    args = sys.argv[1:]
    if not args:
        print("Usage: python resolve_cstar.py <command>")
        sys.exit(1)

    cmd = args[0]
    remaining = args[1:]

    project_root = Path(__file__).resolve().parent.parent.parent.parent
    node_dispatcher = project_root / "bin" / "cstar.js"
    python_dispatcher = project_root / "src" / "core" / "cstar_dispatcher.py"
    venv_python = resolve_project_python(project_root)

    # Node-specific commands
    if cmd in ["start", "dominion", "odin", "ravens"]:
        print(f"Resolving {cmd} via Node Dispatcher...")
        subprocess.run(["node", str(node_dispatcher), cmd, *remaining])
    else:
        # Check if it's a workflow in .agents/workflows
        workflow_dir = project_root / ".agents" / "workflows"
        workflow_match = list(workflow_dir.glob(f"{cmd}.*"))

        if workflow_match:
            print(f"Resolving workflow {cmd} via Python Dispatcher...")
            subprocess.run([str(venv_python), str(python_dispatcher), cmd, *remaining])
        else:
            print(f"Unknown command: {cmd}. Attempting Python fallback...")
            subprocess.run([str(venv_python), str(python_dispatcher), cmd, *remaining])

if __name__ == "__main__":
    resolve()
