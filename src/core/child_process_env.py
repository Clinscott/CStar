"""Child-process environment boundary for CStar intelligence bridges."""

from __future__ import annotations

from collections.abc import Mapping
from functools import lru_cache


_RETIRED_CHILD_ENV_KEYS = frozenset(
    {
        "GOOGLE_API_KEY",
        "GOOGLE_APPLICATION_CREDENTIALS",
        "GOOGLE_API_DAEMON_KEY",
        "MUNINN_API_KEY",
    }
)
_RETIRED_CHILD_ENV_PREFIXES = (
    "GEMINI_",
    "GOOGLE_GENAI_",
    "GOOGLE_GEMINI_",
)


@lru_cache(maxsize=64)
def _allowed_child_env_keys(keys: tuple[str, ...]) -> tuple[str, ...]:
    allowed = []
    for key in keys:
        normalized = key.upper()
        if normalized in _RETIRED_CHILD_ENV_KEYS:
            continue
        if normalized.startswith(_RETIRED_CHILD_ENV_PREFIXES):
            continue
        allowed.append(key)
    return tuple(allowed)


def sanitize_child_process_env(env: Mapping[str, str]) -> dict[str, str]:
    """Return a copy without retired provider state, matching keys case-insensitively."""
    return {key: env[key] for key in _allowed_child_env_keys(tuple(env))}
