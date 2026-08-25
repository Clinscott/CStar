"""Fail-closed compatibility facade for the retired Muninn crucible."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from src.core.engine.ravens.retired import reject_ravens_operation
from src.core.engine.ravens_stage import RavensTargetIdentity


@dataclass(slots=True)
class PreparedCandidate:
    """Historical data shape retained for import/deserialization compatibility only."""

    target: RavensTargetIdentity
    file_path: Path
    test_path: Path
    fix_content: str
    candidate_source: str
    staged_candidate_path: Path | None = None


class MuninnCrucible:
    """Preserve construction without model, sanitizer, file, or process setup."""

    def __init__(self, root: Path | str, uplink: Any = None) -> None:
        self.root = root
        self.uplink = uplink

    @classmethod
    def build_validation_target_from_request(cls, *args: Any, **kwargs: Any) -> dict[str, Any]:
        del cls, args, kwargs
        reject_ravens_operation("MuninnCrucible.build_validation_target_from_request")

    async def generate_gauntlet(self, target: dict, code: str) -> Path | None:
        del target, code
        reject_ravens_operation("MuninnCrucible.generate_gauntlet")

    async def generate_steel(self, target: dict, code: str, test_path: Path) -> str | None:
        del target, code, test_path
        reject_ravens_operation("MuninnCrucible.generate_steel")

    async def prepare_candidate(self, target: dict[str, Any]):
        del target
        reject_ravens_operation("MuninnCrucible.prepare_candidate")

    async def execute_validation_stage(self, *args: Any, **kwargs: Any):
        del args, kwargs
        reject_ravens_operation("MuninnCrucible.execute_validation_stage")

    def verify_fix_result(self, *args: Any, **kwargs: Any):
        del args, kwargs
        reject_ravens_operation("MuninnCrucible.verify_fix_result")

    def verify_fix(self, test_path: Path) -> bool:
        del test_path
        reject_ravens_operation("MuninnCrucible.verify_fix")

    def apply_fix(self, file_path: Path, new_content: str) -> None:
        del file_path, new_content
        reject_ravens_operation("MuninnCrucible.apply_fix")

    def rollback(self, file_path: Path) -> None:
        del file_path
        reject_ravens_operation("MuninnCrucible.rollback")


__all__ = ["MuninnCrucible", "PreparedCandidate"]
