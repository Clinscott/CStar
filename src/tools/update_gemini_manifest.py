"""Retired direct Python context-manifest updater."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR = (
    "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR)


def update_manifest(*_args: object, **_kwargs: object) -> NoReturn:
    """Fail before Git, Hall, persona, filesystem, or output effects."""
    _retired()


class ManifestOrchestrator:
    """Compatibility facade for the retired direct manifest writer."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    @staticmethod
    def _get_git_summary(*_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    @staticmethod
    def _resolve_root(*_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    @staticmethod
    def _get_priority_directives(
        *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    @staticmethod
    def execute(*_args: object, **_kwargs: object) -> NoReturn:
        _retired()


def main(*_args: object, **_kwargs: object) -> NoReturn:
    _retired()


if __name__ == "__main__":
    main()
