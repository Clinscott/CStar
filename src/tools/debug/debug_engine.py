"""Retired directory-backed vector debug engine."""

from typing import NoReturn


LEGACY_VECTOR_SCAN_CALLER_ERROR = (
    "legacy_python_vector_scan_caller_retired_use_cstar_validation"
)


class DebugEngine:
    @staticmethod
    def execute(query: str) -> NoReturn:
        del query
        raise RuntimeError(LEGACY_VECTOR_SCAN_CALLER_ERROR)


def debug_query(query: str) -> NoReturn:
    del query
    raise RuntimeError(LEGACY_VECTOR_SCAN_CALLER_ERROR)


if __name__ == "__main__":
    DebugEngine.execute("")
