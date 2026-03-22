from __future__ import annotations

import asyncio
import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.engine.ravens.ravens_runtime import execute_ravens_cycle_contract


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--project-root",
        default=str(PROJECT_ROOT),
        help="Repository root to sweep with the canonical one-cycle ravens runtime.",
    )
    args = parser.parse_args()

    result = asyncio.run(execute_ravens_cycle_contract(Path(args.project_root).resolve()))
    print(json.dumps(result.to_dict(), indent=2))


if __name__ == "__main__":
    main()
