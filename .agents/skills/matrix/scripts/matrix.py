import argparse
import sys
import subprocess
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

def main():
    parser = argparse.ArgumentParser(description="Gungnir Matrix: 3D Visualization and Graphing.")
    parser.add_argument("--compile", action="store_true", help="Compile global matrix-graph.json")
    parser.add_argument("--view", action="store_true", help="Launch 3D visualization bridge")
    
    args = parser.parse_args()

    npx_cmd = "npx.cmd" if sys.platform == "win32" else "npx"

    if args.compile:
        compiler_script = PROJECT_ROOT / "src" / "tools" / "pennyone" / "intel" / "compiler.ts"
        print("[🔱] Compiling Gungnir Matrix...")
        subprocess.run([npx_cmd, "tsx", str(compiler_script)], check=True)
        print("[ALFRED]: Matrix compilation complete.")
    elif args.view:
        print("[🔱] Awakening the 3D Visualization Bridge...")
        # Trigger the view logic
        subprocess.run(["node", str(PROJECT_ROOT / "bin" / "cstar.js"), "p1", "--view"])
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
