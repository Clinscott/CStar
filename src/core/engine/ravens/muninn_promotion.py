"""Pure promotion metadata helpers for a retired Ravens lifecycle surface."""

from __future__ import annotations

from pathlib import Path
from typing import NoReturn

from src.core.engine.ravens_stage import RavensStageResult, RavensTargetIdentity


LEGACY_PYTHON_RAVENS_ENGINE_ERROR = (
    "legacy_python_ravens_engine_retired_use_cstar_kernel"
)


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_RAVENS_ENGINE_ERROR)


class MuninnPromotion:
    """Preserve detached metadata helpers; reject mutation and callbacks."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    @staticmethod
    def _backup_path(file_path: Path) -> Path:
        return Path(str(file_path) + ".bak")

    @staticmethod
    def _score_delta(validation_stage: RavensStageResult) -> float:
        score_delta = validation_stage.metadata.get("score_delta")
        if isinstance(score_delta, dict):
            delta = score_delta.get("delta")
            if isinstance(delta, dict):
                try:
                    return float(delta.get("overall", 0.0) or 0.0)
                except (TypeError, ValueError):
                    return 0.0
        return 0.0

    @staticmethod
    def _string_ref(value: object) -> str | None:
        return None if value in (None, "") else str(value)

    @staticmethod
    def _mission_id(
        target: RavensTargetIdentity, validation_stage: RavensStageResult
    ) -> str:
        mission_id = validation_stage.metadata.get("mission_id")
        if isinstance(mission_id, str) and mission_id:
            return mission_id
        if target.bead_id:
            return target.bead_id
        if target.target_path:
            return f"mission:{target.target_path}"
        return "mission:ravens-promote"

    def _rollback_file(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def _clear_backup(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def _block_bead(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def _build_failure_result(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    def execute_promotion_stage(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()
