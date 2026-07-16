"""Pure legacy feedback parsing and a retired autonomous context runtime."""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any, NoReturn


LEGACY_CONTEXT_EFFECT_ERROR = (
    "legacy_python_context_effect_surface_retired_use_cstar_kernel"
)


def parse_feedback_context(lines: Iterable[str]) -> list[str]:
    """Parse explicit JSONL strings without reading feedback or persona state."""
    poor_files: set[str] = set()
    for line in lines:
        try:
            value: Any = json.loads(line)
        except (TypeError, json.JSONDecodeError):
            continue
        if not isinstance(value, Mapping):
            continue
        score = value.get("score")
        target = value.get("target_file")
        if (
            isinstance(score, (int, float))
            and not isinstance(score, bool)
            and score <= 2
            and isinstance(target, str)
            and target
            and target != "unknown"
        ):
            poor_files.add(target)
    return sorted(poor_files)


class SovereignContext:
    """Import-compatible tombstone for feedback, trace, and HUD side effects."""

    def __init__(self, project_root: Path) -> NoReturn:
        del project_root
        raise RuntimeError(LEGACY_CONTEXT_EFFECT_ERROR)
