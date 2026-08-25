"""Retired autonomous Git spoke."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_RAVENS_ENGINE_ERROR = (
    "legacy_python_ravens_engine_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_RAVENS_ENGINE_ERROR)


class GitSpoke:
    """Fail before repository inspection or mutation."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    def run_cmd(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def is_clean(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def ensure_branch(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def restore_branch(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def commit_changes(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()
