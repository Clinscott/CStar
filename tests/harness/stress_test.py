"""Retired direct Python provider-backed Ravens stress harness."""

from __future__ import annotations

from typing import NoReturn


LEGACY_PYTHON_RAVENS_ENGINE_ERROR = (
    "legacy_python_ravens_engine_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_RAVENS_ENGINE_ERROR)


class SovereignStressTest:
    """Fail before secrets, provider construction, traces, or retries."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    def log_teacher(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def log_student(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def get_latest_trace(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def analyze_failure(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def teach_lesson(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def run(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()


def main(*_args: object, **_kwargs: object) -> NoReturn:
    _retired()


if __name__ == "__main__":
    main()
