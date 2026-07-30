"""Retired direct SQLite lease manager."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR = (
    "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR)


class LeaseManager:
    """Fail before SQLite, filesystem, or lease mutation."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    def _get_conn(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def acquire_lease(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def release_lease(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()
