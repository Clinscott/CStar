"""Fail-closed compatibility facade for retired Ravens mission selection."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from src.core.engine.ravens.retired import reject_ravens_operation


class MissionCoordinator:
    def __init__(self, root: Path | str) -> None:
        self.root = root

    def select_mission(self, runtime_breaches: list, **_: Any) -> dict | None:
        del runtime_breaches
        reject_ravens_operation("MissionCoordinator.select_mission")

    def _select_legacy_projected_mission(self) -> dict | None:
        reject_ravens_operation("MissionCoordinator._select_legacy_projected_mission")

    def _legacy_sort(self, breaches: list) -> dict | None:
        del breaches
        reject_ravens_operation("MissionCoordinator._legacy_sort")


__all__ = ["MissionCoordinator"]
