"""Retired directory-backed fishtest diagnostic."""

from typing import NoReturn


LEGACY_VECTOR_SCAN_CALLER_ERROR = (
    "legacy_python_vector_scan_caller_retired_use_cstar_validation"
)


def run_debug_fishtest(data_path: str = "fishtest_data.json") -> NoReturn:
    del data_path
    raise RuntimeError(LEGACY_VECTOR_SCAN_CALLER_ERROR)


class FishtestLegacyDiagnostic:
    @staticmethod
    def execute(data_path: str = "fishtest_data.json") -> NoReturn:
        del data_path
        raise RuntimeError(LEGACY_VECTOR_SCAN_CALLER_ERROR)


if __name__ == "__main__":
    FishtestLegacyDiagnostic.execute()
