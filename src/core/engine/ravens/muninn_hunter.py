"""Retired autonomous Ravens mission hunter."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_RAVENS_ENGINE_ERROR = (
    "legacy_python_ravens_engine_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_RAVENS_ENGINE_ERROR)


class MuninnHunter:
    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    async def execute_hunt(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def select_target(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()
