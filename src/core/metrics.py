"""Retired Python execution and project-health scoring surface."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR = (
    "legacy_python_sovereign_component_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_SOVEREIGN_COMPONENT_ERROR)


class ExecutionTracker:
    """Fail before process inspection, timing callbacks, or HUD output."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    def __enter__(self) -> NoReturn:
        _retired()

    def __exit__(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    @property
    def latency_ms(self) -> NoReturn:
        _retired()

    @property
    def mem_delta_mb(self) -> NoReturn:
        _retired()

    def report(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    @staticmethod
    def track(*_args: object, **_kwargs: object) -> NoReturn:
        _retired()


class ProjectMetricsEngine:
    """Fail before filesystem reads, model inference, subprocesses, or scoring."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    def compute(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()
