"""Fail-closed compatibility facade for the retired Ravens repository spoke."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from src.core.engine.ravens.retired import reject_ravens_operation


class RepoSpoke:
    def __init__(self, repo_path: Path | str, persona: str, use_docker: bool = False) -> None:
        self.repo_path = repo_path
        self.persona = persona
        self.use_docker = bool(use_docker)

    async def process(self, bootstrap_fn: Callable[..., Any]) -> bool:
        del bootstrap_fn
        reject_ravens_operation("RepoSpoke.process")


__all__ = ["RepoSpoke"]
