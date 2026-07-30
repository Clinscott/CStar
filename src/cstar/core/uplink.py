"""Pure output parser for a retired direct Python model uplink."""

from __future__ import annotations

import re
from typing import Any, NoReturn


LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR = (
    "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR)


def clean_cli_output(text: str) -> str:
    """Strip ANSI wrappers and return the detached JSON-shaped region."""
    ansi_escape = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")
    cleaned = ansi_escape.sub("", text).strip()
    object_start = cleaned.find("{")
    array_start = cleaned.find("[")
    starts = [position for position in (object_start, array_start) if position >= 0]
    if starts:
        start = min(starts)
        end = max(cleaned.rfind("}"), cleaned.rfind("]"))
        if end > start:
            return cleaned[start : end + 1].strip()
    return cleaned


class AntigravityUplink:
    """Fail before secrets, Mimir, provider, logging, or callback effects."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    async def send_payload(
        self,
        _query: str,
        _context: dict[str, Any] | None = None,
    ) -> NoReturn:
        _retired()

    @staticmethod
    async def query_bridge(
        _query: str,
        _context: dict[str, Any] | None = None,
    ) -> NoReturn:
        _retired()
