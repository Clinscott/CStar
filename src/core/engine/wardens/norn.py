"""Retired direct Python campaign and bead lifecycle warden."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR = (
    "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR)


class NornWarden:
    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    def scan(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def get_next_target(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def mark_complete(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()
