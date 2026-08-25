"""Retired direct provider-backed cohesion scorer."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_RAVENS_ENGINE_ERROR = (
    "legacy_python_ravens_engine_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_RAVENS_ENGINE_ERROR)


class CohesionScorer:
    """Fail before provider, filesystem, score, or output effects."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    def lexical_score(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    async def intent_score(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    async def run_audit(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()


async def main(*_args: object, **_kwargs: object) -> NoReturn:
    _retired()
