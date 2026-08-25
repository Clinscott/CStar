#!/usr/bin/env python3
"""Retired direct Python Ravens integrity verifier."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_RAVENS_ENGINE_ERROR = (
    "legacy_python_ravens_engine_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_RAVENS_ENGINE_ERROR)


def verify_system_integrity(*_args: object, **_kwargs: object) -> NoReturn:
    """Fail before imports, environment mutation, construction, or output."""
    _retired()


class IntegrityVerifier:
    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    @staticmethod
    def verify(*_args: object, **_kwargs: object) -> NoReturn:
        _retired()


def main(*_args: object, **_kwargs: object) -> NoReturn:
    _retired()


if __name__ == "__main__":
    main()
