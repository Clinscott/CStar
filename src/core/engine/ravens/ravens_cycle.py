"""Retired Ravens command-line cycle."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_RAVENS_ENGINE_ERROR = (
    "legacy_python_ravens_engine_retired_use_cstar_kernel"
)


def main(*_args: object, **_kwargs: object) -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_RAVENS_ENGINE_ERROR)


if __name__ == "__main__":
    main()
