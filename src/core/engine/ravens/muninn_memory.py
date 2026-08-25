"""Retired Ravens memory, trace, and Hall projection surface."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_RAVENS_ENGINE_ERROR = (
    "legacy_python_ravens_engine_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_RAVENS_ENGINE_ERROR)


class MuninnMemory:
    """Fail before filesystem, Hall, trace, or state mutation."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    def repo_id(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def load_ledger(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def record_stage_observation(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    def record_trace(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def log_cycle_completion(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    def sync_intent_integrity_from_sprt(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()
