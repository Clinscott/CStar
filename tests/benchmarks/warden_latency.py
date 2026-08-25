"""Retired direct Python anomaly-warden benchmark."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR = (
    "legacy_python_sovereign_component_retired_use_cstar_kernel"
)


def run_benchmark(*_args: object, **_kwargs: object) -> NoReturn:
    """Fail before scorer construction, random work, timing, or output."""
    raise RuntimeError(LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR)


def main(*_args: object, **_kwargs: object) -> NoReturn:
    run_benchmark()


if __name__ == "__main__":
    main()
