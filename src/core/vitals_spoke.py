"""Retired direct Python vitals projection entrypoint."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR = (
    "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel"
)


def get_vitals(*_args: object, **_kwargs: object) -> NoReturn:
    """Fail before RPC, Hall, state, filesystem, or output effects."""
    raise RuntimeError(LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR)


def main(*_args: object, **_kwargs: object) -> NoReturn:
    get_vitals()


if __name__ == "__main__":
    main()
