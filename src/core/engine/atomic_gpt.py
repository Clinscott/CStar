"""Retired local neural warden compatibility surface.

The historical wardens loaded and persisted model state and could query Mimir.
Current validation is evidence-backed through CStar; this module performs no
model, memory, filesystem, or provider work.
"""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR = (
    "legacy_python_sovereign_component_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR)


class WardenCircuitBreaker(Exception):
    """Compatibility exception type; it grants no execution authority."""


class BaseWarden:
    """Fail-closed shell for the retired neural warden base."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    def train(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def eval(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def sigmoid(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def relu(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def _normalize(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    async def get_lore_alignment(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    def forward(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()


class AnomalyWarden(BaseWarden):
    def train_step(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def log_anomaly(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def save(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def load(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()


class SessionWarden(BaseWarden):
    def train_step(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def save(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def load(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()


def main(*_args: object, **_kwargs: object) -> NoReturn:
    _retired()


if __name__ == "__main__":
    main()
