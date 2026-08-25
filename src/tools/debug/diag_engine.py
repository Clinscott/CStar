"""Retired directory-backed vector diagnostic engine."""

from typing import NoReturn


LEGACY_VECTOR_SCAN_CALLER_ERROR = (
    "legacy_python_vector_scan_caller_retired_use_cstar_validation"
)


def run_diag() -> NoReturn:
    raise RuntimeError(LEGACY_VECTOR_SCAN_CALLER_ERROR)


class DiagnosticEngine:
    @staticmethod
    def execute() -> NoReturn:
        raise RuntimeError(LEGACY_VECTOR_SCAN_CALLER_ERROR)


if __name__ == "__main__":
    DiagnosticEngine.execute()
