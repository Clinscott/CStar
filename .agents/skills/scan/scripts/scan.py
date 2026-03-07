import argparse
import sys
import subprocess
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

def main():
    parser = argparse.ArgumentParser(description="PennyOne Scan: Update the Gungnir Matrix.")
    parser.add_argument("--path", default=".", help="The root path or sector to scan.")
    parser.add_argument("--force", action="store_true", help="Force re-analysis of all files.")
    parser.add_argument("--mock", action="store_true", help="Use mock intent generation (fast/offline).")
    args = parser.parse_args()

    pennyone_bin = PROJECT_ROOT / "bin" / "pennyone.js"
    
    if not pennyone_bin.exists():
        print(f"[ALFRED]: CRITICAL - PennyOne engine missing at {pennyone_bin}", file=sys.stderr)
        sys.exit(1)

    try:
        # Construct the command for the Node.js backend
        # Using npx.cmd on Windows, npx on Linux/Mac
        npx_cmd = "npx.cmd" if sys.platform == "win32" else "npx"
        
        cmd = [npx_cmd, "tsx", str(pennyone_bin), "scan", args.path]
        if args.force:
            cmd.append("--force")
        if args.mock:
            cmd.append("--mock")

        # Execute the scan, streaming output directly to the user
        subprocess.run(cmd, check=True)

    except subprocess.CalledProcessError as e:
        print(f"[ALFRED]: The scanning sequence encountered an error, sir.", file=sys.stderr)
        sys.exit(e.returncode)
    except Exception as e:
        print(f"Scan trigger failed: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
