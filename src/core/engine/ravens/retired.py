"""Shared fail-closed contract for the retired Python Ravens runtime."""

from __future__ import annotations

from typing import NoReturn

from src.core.engine.ravens_stage import RavensCycleResult

RAVENS_DECOMMISSIONED_CODE = "RAVENS_EXECUTION_DECOMMISSIONED"
RAVENS_DECOMMISSIONED_MESSAGE = (
    "The legacy Python Ravens execution lane is decommissioned. "
    "Use the CStar-authorized Forge and independent validation lifecycle."
)


class RavensExecutionDecommissioned(RuntimeError):
    """Raised whenever an old Python Ravens actuation surface is invoked."""

    code = RAVENS_DECOMMISSIONED_CODE

    def __init__(self, operation: str) -> None:
        self.operation = operation
        super().__init__(f"{RAVENS_DECOMMISSIONED_CODE}: {operation}: {RAVENS_DECOMMISSIONED_MESSAGE}")


def reject_ravens_operation(operation: str) -> NoReturn:
    """Reject an old operation without touching a model, process, file, Git, or Hall."""

    raise RavensExecutionDecommissioned(operation)


def rejected_cycle_result(project_root: object) -> RavensCycleResult:
    """Return the single structured rejection used by boolean/runtime adapters."""

    return RavensCycleResult(
        status="FAILURE",
        summary=RAVENS_DECOMMISSIONED_MESSAGE,
        mission_id="compatibility:ravens-execution-rejected",
        metadata={
            "adapter": "compatibility:ravens-execution-rejected",
            "requested_project_root": str(project_root),
            "decommissioned": True,
            "read_only": True,
            "execution_attempted": False,
            "error_code": RAVENS_DECOMMISSIONED_CODE,
        },
    )


__all__ = [
    "RAVENS_DECOMMISSIONED_CODE",
    "RAVENS_DECOMMISSIONED_MESSAGE",
    "RavensExecutionDecommissioned",
    "reject_ravens_operation",
    "rejected_cycle_result",
]
