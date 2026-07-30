"""Retired direct Python Ravens learning harness."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_RAVENS_ENGINE_ERROR = (
    "legacy_python_ravens_engine_retired_use_cstar_kernel"
)


def run_learning_cycle(*_args: object, **_kwargs: object) -> NoReturn:
    """Fail before secrets, provider, filesystem, or autonomous execution."""
    raise RuntimeError(LEGACY_PYTHON_RAVENS_ENGINE_ERROR)


def main(*_args: object, **_kwargs: object) -> NoReturn:
    run_learning_cycle()


if __name__ == "__main__":
    main()
