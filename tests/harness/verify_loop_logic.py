"""Retired direct Python autonomous-loop verification harness."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_RAVENS_ENGINE_ERROR = (
    "legacy_python_ravens_engine_retired_use_cstar_kernel"
)


def run_autonomous_loop_verification(
    *_args: object, **_kwargs: object
) -> NoReturn:
    """Fail before provider, process, filesystem, or memory effects."""
    raise RuntimeError(LEGACY_PYTHON_RAVENS_ENGINE_ERROR)


def main(*_args: object, **_kwargs: object) -> NoReturn:
    run_autonomous_loop_verification()


if __name__ == "__main__":
    main()
