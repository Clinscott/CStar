"""Fail-closed compatibility facade for the retired Muninn heart."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from src.core.engine.ravens.retired import reject_ravens_operation, rejected_cycle_result
from src.core.engine.ravens_stage import RavensCycleResult


class MuninnHeart:
    """Preserve construction without creating spokes or touching repository state."""

    def __init__(self, root: Path | str, uplink: Any = None) -> None:
        self.root = root
        self.uplink = uplink

    @property
    def agent_id(self) -> str:
        return "MUNINN_RETIRED"

    async def _run_behavioral_pulse(self) -> bool:
        reject_ravens_operation("MuninnHeart._run_behavioral_pulse")

    async def execute_cycle_contract(self) -> RavensCycleResult:
        return rejected_cycle_result(self.root)

    async def execute_cycle(self) -> bool:
        reject_ravens_operation("MuninnHeart.execute_cycle")

    def _wait_for_silence(self) -> None:
        reject_ravens_operation("MuninnHeart._wait_for_silence")

    def _repository_activity_snapshot(self) -> str:
        reject_ravens_operation("MuninnHeart._repository_activity_snapshot")


__all__ = ["MuninnHeart"]
