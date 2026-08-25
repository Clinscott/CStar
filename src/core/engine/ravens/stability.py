"""Fail-closed compatibility facade for retired Ravens stability mutation."""

from __future__ import annotations

from pathlib import Path

from src.core.engine.ravens.retired import reject_ravens_operation


class GungnirValidator:
    def __init__(self, *args, **kwargs) -> None:
        del args, kwargs

    def record_trial(self, success: bool) -> None:
        del success
        reject_ravens_operation("GungnirValidator.record_trial")

    @property
    def status(self) -> str:
        reject_ravens_operation("GungnirValidator.status")


class TheWatcher:
    def __init__(self, root: Path | str) -> None:
        self.root = root

    def is_locked(self, rel_path: str) -> bool:
        del rel_path
        reject_ravens_operation("TheWatcher.is_locked")

    def record_edit(self, rel_path: str, content: str) -> bool:
        del rel_path, content
        reject_ravens_operation("TheWatcher.record_edit")

    def get_last_edit_time(self) -> float:
        reject_ravens_operation("TheWatcher.get_last_edit_time")

    def record_failure(self, rel_path: str) -> int:
        del rel_path
        reject_ravens_operation("TheWatcher.record_failure")


SPRT = GungnirValidator

__all__ = ["GungnirValidator", "SPRT", "TheWatcher"]
