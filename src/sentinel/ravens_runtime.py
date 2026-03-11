from __future__ import annotations

from pathlib import Path
from typing import Any

from src.core.engine.ravens_stage import RavensCycleResult
from src.cstar.core.uplink import AntigravityUplink
from src.sentinel.muninn_heart import MuninnHeart


async def execute_ravens_cycle_contract(
    project_root: Path | str,
    *,
    uplink: Any | None = None,
) -> RavensCycleResult:
    root = Path(project_root).resolve()
    runtime_uplink = uplink or AntigravityUplink()
    heart = MuninnHeart(root, runtime_uplink)
    return await heart.execute_cycle_contract()


async def execute_ravens_cycle(
    project_root: Path | str,
    *,
    uplink: Any | None = None,
) -> bool:
    cycle = await execute_ravens_cycle_contract(project_root, uplink=uplink)
    return cycle.status == "SUCCESS"
