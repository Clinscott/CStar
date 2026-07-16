"""Retired Python annexation scanner and plan writer."""

from __future__ import annotations

from pathlib import Path
from typing import NoReturn


LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR = (
    "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR)


class HeimdallWarden:
    """Preserve only the detached path-exclusion predicate."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    @staticmethod
    def _should_ignore(path: Path) -> bool:
        parts = path.parts
        if any(
            name in parts
            for name in (
                ".git",
                ".venv",
                "__pycache__",
                "node_modules",
                "target",
                ".corvus_quarantine",
                "tests",
                "temp_gauntlet",
            )
        ):
            return True
        if any(part.startswith(".") for part in parts):
            return True
        return path.name == "__init__.py"

    def scan(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def _audit_code(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def _generate_plan(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()


def main(*_args: object, **_kwargs: object) -> NoReturn:
    _retired()


if __name__ == "__main__":
    main()
