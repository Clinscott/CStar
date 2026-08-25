"""Fail-closed compatibility facade for the retired Muninn hunter."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from src.core.engine.ravens.retired import reject_ravens_operation


class MuninnHunter:
    def __init__(self, root: Path | str, memory: Any = None) -> None:
        self.root = root
        self.memory = memory

    async def execute_hunt(self) -> tuple[list[dict], dict]:
        reject_ravens_operation("MuninnHunter.execute_hunt")

    def select_target(self, breaches: list[dict]) -> dict | None:
        del breaches
        reject_ravens_operation("MuninnHunter.select_target")


__all__ = ["MuninnHunter"]
