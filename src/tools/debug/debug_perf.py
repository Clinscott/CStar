"""Retired directory-backed vector performance profiler."""

from typing import NoReturn


LEGACY_VECTOR_SCAN_CALLER_ERROR = (
    "legacy_python_vector_scan_caller_retired_use_cstar_validation"
)


def run_profile() -> NoReturn:
    raise RuntimeError(LEGACY_VECTOR_SCAN_CALLER_ERROR)


class PerformanceProfiler:
    @staticmethod
    def execute() -> NoReturn:
        raise RuntimeError(LEGACY_VECTOR_SCAN_CALLER_ERROR)


if __name__ == "__main__":
    PerformanceProfiler.execute()
