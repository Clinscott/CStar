#!/usr/bin/env python3
"""Retired compatibility entrypoint; persona state is owned by the Hall store."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


class PersonaWriteError(Exception):
    """Stable, value-free persona mutation failure."""


def set_active_persona(control_root: Path, persona: str) -> dict[str, Any]:
    del control_root, persona
    raise PersonaWriteError("persona_config_writer_retired_use_hall_persona_state")


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        return 2
    try:
        set_active_persona(Path(argv[1]), argv[2])
    except PersonaWriteError as error:
        sys.stdout.write(json.dumps({"status": "error", "error": str(error)}))
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
