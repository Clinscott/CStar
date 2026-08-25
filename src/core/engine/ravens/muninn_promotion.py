"""Fail-closed compatibility facade for retired Muninn promotion."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from src.core.engine.ravens.retired import reject_ravens_operation

StageObservationRecorder = Callable[[str, str, str, dict[str, Any] | None], str]
TraceRecorder = Callable[[str, str, str, float, str], str]


class MuninnPromotion:
    """Preserve construction without watcher, file, or lifecycle initialization."""

    def __init__(self, root: Path | str, watcher: Any = None) -> None:
        self.root = root
        self.watcher = watcher

    def execute_promotion_stage(self, *args: Any, **kwargs: Any):
        del args, kwargs
        reject_ravens_operation("MuninnPromotion.execute_promotion_stage")

    def _rollback_file(self, file_path: Path) -> bool:
        del file_path
        reject_ravens_operation("MuninnPromotion._rollback_file")

    def _clear_backup(self, file_path: Path) -> None:
        del file_path
        reject_ravens_operation("MuninnPromotion._clear_backup")


__all__ = ["MuninnPromotion", "StageObservationRecorder", "TraceRecorder"]
