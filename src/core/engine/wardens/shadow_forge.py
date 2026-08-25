"""Retired Docker-backed Shadow Forge compatibility surface."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR = (
    "legacy_python_sovereign_component_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR)


class ShadowForgeWarden:
    """Fail before environment, Docker, process, or promotion effects."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    def _get_docker_executable(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    def scan(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def execute_cycle(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def _promote_from_container(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()
