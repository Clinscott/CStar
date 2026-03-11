import argparse
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[4]


def main() -> None:
    parser = argparse.ArgumentParser(description="Transitional chant adapter over the runtime-owned chant weave.")
    parser.add_argument("query", nargs="+", help="The natural language chant.")
    args = parser.parse_args()

    launcher = "npx.cmd" if sys.platform == "win32" else "npx"
    command = [
        launcher,
        "tsx",
        str(PROJECT_ROOT / "cstar.ts"),
        "chant",
        " ".join(args.query),
    ]

    completed = subprocess.run(command, cwd=str(PROJECT_ROOT), text=True, encoding="utf-8")
    raise SystemExit(completed.returncode)


if __name__ == "__main__":
    main()
