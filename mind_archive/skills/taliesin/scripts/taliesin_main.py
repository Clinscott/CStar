"""
[ENTRY] TALIESIN - CStar adapter
Purpose: Delegate TALIESIN execution to the mounted Taliesin spoke.
"""

from __future__ import annotations

import runpy
import sys
from pathlib import Path


def _resolve_spoke_main() -> Path:
    estate_root = Path(__file__).resolve().parents[5]
    spoke_main = estate_root / "Taliesin" / "scripts" / "taliesin_main.py"
    if not spoke_main.exists():
        raise FileNotFoundError(
            f"Taliesin spoke entrypoint not found: {spoke_main}. "
            "Mount or provision /home/morderith/Corvus/Taliesin first."
        )
    return spoke_main


def main() -> None:
    spoke_main = _resolve_spoke_main()
    if str(spoke_main.parent) not in sys.path:
        sys.path.insert(0, str(spoke_main.parent))
    runpy.run_path(str(spoke_main), run_name="__main__")


if __name__ == "__main__":
    main()
