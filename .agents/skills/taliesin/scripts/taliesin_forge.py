"""
[ENTRY] TALIESIN Forge - CStar adapter
Purpose: Delegate TALIESIN forge execution to the mounted Taliesin spoke.
"""

from __future__ import annotations

import runpy
import sys
from pathlib import Path


def _resolve_spoke_forge() -> Path:
    estate_root = Path(__file__).resolve().parents[5]
    spoke_forge = estate_root / "Taliesin" / "scripts" / "taliesin_forge.py"
    if not spoke_forge.exists():
        raise FileNotFoundError(
            f"Taliesin spoke forge entrypoint not found: {spoke_forge}. "
            "Mount or provision /home/morderith/Corvus/Taliesin first."
        )
    return spoke_forge


def main() -> None:
    spoke_forge = _resolve_spoke_forge()
    if str(spoke_forge.parent) not in sys.path:
        sys.path.insert(0, str(spoke_forge.parent))
    runpy.run_path(str(spoke_forge), run_name="__main__")


if __name__ == "__main__":
    main()
