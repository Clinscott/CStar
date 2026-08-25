"""Retired direct Python bead lifecycle coordinator."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR = (
    "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR)


class NornCoordinator:
    """Fail before Hall, projection, claim, block, or resolution effects."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    def _get_conn(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def sync_tasks(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def peek_next_bead(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def get_next_bead(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def complete_bead_work(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    def finalize_bead(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def block_bead(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def resolve_bead(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()
