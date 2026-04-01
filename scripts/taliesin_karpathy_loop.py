#!/usr/bin/env python3
"""
CStar compatibility wrapper for the mounted Taliesin Karpathy loop.
"""

from __future__ import annotations

import runpy
import sys
from pathlib import Path


def _resolve_spoke_entrypoint() -> Path:
    estate_root = Path(__file__).resolve().parents[2]
    spoke_entry = estate_root / "Taliesin" / "scripts" / "taliesin_karpathy_loop.py"
    if not spoke_entry.exists():
        raise FileNotFoundError(f"Taliesin spoke Karpathy loop not found: {spoke_entry}")
    return spoke_entry


def main() -> None:
    spoke_entry = _resolve_spoke_entrypoint()
    if str(spoke_entry.parent) not in sys.path:
        sys.path.insert(0, str(spoke_entry.parent))
    runpy.run_path(str(spoke_entry), run_name="__main__")


if __name__ == "__main__":
    main()

