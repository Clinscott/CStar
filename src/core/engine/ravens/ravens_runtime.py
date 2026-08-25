"""Fail-closed import compatibility for the retired Python Ravens runtime."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from src.core.engine.ravens.retired import rejected_cycle_result
from src.core.engine.ravens_stage import RavensCycleResult


async def execute_ravens_cycle_contract(
    project_root: Path | str,
    *,
    uplink: Any | None = None,
) -> RavensCycleResult:
    """Return a rejection receipt; ``uplink`` is ignored and never invoked."""

    del uplink
    return rejected_cycle_result(project_root)


async def execute_ravens_cycle(
    project_root: Path | str,
    *,
    uplink: Any | None = None,
) -> bool:
    """Preserve the boolean facade while always rejecting legacy execution."""

    result = await execute_ravens_cycle_contract(project_root, uplink=uplink)
    return result.status == "SUCCESS"


__all__ = ["execute_ravens_cycle", "execute_ravens_cycle_contract"]
