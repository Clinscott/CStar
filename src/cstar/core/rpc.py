"""Retired direct Python dashboard projection RPC."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR = (
    "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR)


class SovereignRPC:
    """Fail before SQLite, Hall, filesystem, or state projection reads."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    def get_recent_traces(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def get_architectural_suggestions(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    def get_dashboard_state(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    def _parse_tasks(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()
