"""Retired directory-backed collision investigator."""

from typing import NoReturn


LEGACY_VECTOR_SCAN_CALLER_ERROR = (
    "legacy_python_vector_scan_caller_retired_use_cstar_validation"
)


class CollisionInvestigator:
    @staticmethod
    def execute() -> NoReturn:
        raise RuntimeError(LEGACY_VECTOR_SCAN_CALLER_ERROR)


if __name__ == "__main__":
    CollisionInvestigator.execute()
