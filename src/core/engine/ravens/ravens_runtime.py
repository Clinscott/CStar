"""Retired autonomous Ravens runtime entrypoints."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_RAVENS_ENGINE_ERROR = (
    "legacy_python_ravens_engine_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_RAVENS_ENGINE_ERROR)


async def execute_ravens_cycle_contract(
    *_args: object, **_kwargs: object
) -> NoReturn:
    _retired()


async def execute_ravens_cycle(*_args: object, **_kwargs: object) -> NoReturn:
    _retired()
