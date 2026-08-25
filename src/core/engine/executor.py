"""Retired legacy proactive executor."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR = (
    "legacy_python_sovereign_component_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR)


class SovereignExecutor:
    """Fail before process, install, Cortex, or bead side effects."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    def handle_proactive(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def suggest_forge(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def handle_cortex_query(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()
