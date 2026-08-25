"""Fail-closed compatibility facade for retired Muninn persistence."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from src.core.engine.ravens.retired import reject_ravens_operation


class MuninnMemory:
    """Preserve construction without creating directories or opening Hall."""

    def __init__(self, root: Path | str) -> None:
        self.root = root

    def repo_id(self) -> str:
        reject_ravens_operation("MuninnMemory.repo_id")

    def load_ledger(self) -> dict:
        reject_ravens_operation("MuninnMemory.load_ledger")

    def record_stage_observation(
        self,
        stage: str,
        outcome: str,
        observation: str,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        del stage, outcome, observation, metadata
        reject_ravens_operation("MuninnMemory.record_stage_observation")

    def record_trace(
        self,
        mission_id: str,
        file_path: str,
        action: str,
        score_delta: float,
        status: str,
    ) -> str:
        del mission_id, file_path, action, score_delta, status
        reject_ravens_operation("MuninnMemory.record_trace")

    def log_cycle_completion(self, cycle_count: int, total_errors: int) -> str:
        del cycle_count, total_errors
        reject_ravens_operation("MuninnMemory.log_cycle_completion")

    def sync_intent_integrity_from_sprt(self) -> float | None:
        reject_ravens_operation("MuninnMemory.sync_intent_integrity_from_sprt")


__all__ = ["MuninnMemory"]
