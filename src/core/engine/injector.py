"""Retired legacy discovery and lexicon injector."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR = (
    "legacy_python_sovereign_component_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR)


class SovereignInjector:
    """Fail before registry scans, web access, or filesystem learning."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    def proactive_discovery(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def proactive_lexicon_lift(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()
