#!/usr/bin/env python3
"""Emit only the bounded active CStar persona from the local config source."""

from __future__ import annotations

import json
import sys
from pathlib import Path

MAX_CONFIG_BYTES = 1_048_576
CANONICAL = {
    "ODIN": "O.D.I.N.",
    "O.D.I.N.": "O.D.I.N.",
    "ALFRED": "A.L.F.R.E.D.",
    "A.L.F.R.E.D.": "A.L.F.R.E.D.",
}


def read_active_persona(control_root: Path) -> str:
    config_path = control_root / ".agents" / "config.json"
    with config_path.open("rb") as handle:
        raw = handle.read(MAX_CONFIG_BYTES + 1)
    if len(raw) > MAX_CONFIG_BYTES:
        raise ValueError("active_persona_config_too_large")
    parsed = json.loads(raw.decode("utf-8"))
    if not isinstance(parsed, dict):
        raise ValueError("active_persona_config_invalid")
    system = parsed.get("system")
    active = parsed.get("activePersona")
    candidates = [
        system.get("persona") if isinstance(system, dict) else None,
        parsed.get("persona"),
        parsed.get("Persona"),
        active.get("name") if isinstance(active, dict) else None,
    ]
    resolved = {CANONICAL[value] for value in candidates if value in CANONICAL}
    if len(resolved) != 1:
        raise ValueError("active_persona_value_invalid")
    return resolved.pop()


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        return 2
    try:
        persona = read_active_persona(Path(argv[1]))
    except FileNotFoundError:
        return 3
    except (TypeError, UnicodeError, ValueError):
        return 2
    except OSError:
        return 4
    sys.stdout.write(persona)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
