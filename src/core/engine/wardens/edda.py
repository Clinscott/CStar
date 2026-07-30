"""Retired recursive Edda documentation scanner."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR = (
    "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR)


class EddaWarden:
    """Fail before recursive source or documentation reads."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    def scan(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    async def scan_async(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    async def propose_evolution(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()
