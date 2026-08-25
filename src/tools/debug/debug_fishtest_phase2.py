"""Retired directory-backed phase-two fishtest diagnostic."""

from typing import NoReturn


LEGACY_VECTOR_SCAN_CALLER_ERROR = (
    "legacy_python_vector_scan_caller_retired_use_cstar_validation"
)


def run_debug_phase2(data_path: str = "fishtest_phase2_data.json") -> NoReturn:
    del data_path
    raise RuntimeError(LEGACY_VECTOR_SCAN_CALLER_ERROR)


class FishtestDiagnostic:
    @staticmethod
    def execute(data_path: str = "fishtest_phase2_data.json") -> NoReturn:
        del data_path
        raise RuntimeError(LEGACY_VECTOR_SCAN_CALLER_ERROR)


if __name__ == "__main__":
    FishtestDiagnostic.execute()
