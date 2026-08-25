"""Fail-closed compatibility facade for the retired Ravens Git spoke."""

from __future__ import annotations

from pathlib import Path

from src.core.engine.ravens.retired import reject_ravens_operation


class GitSpoke:
    def __init__(self, repo_path: Path | str) -> None:
        self.repo_path = repo_path

    def run_cmd(self, args: list[str]) -> str | None:
        del args
        reject_ravens_operation("GitSpoke.run_cmd")

    def is_clean(self) -> bool:
        reject_ravens_operation("GitSpoke.is_clean")

    def ensure_branch(self, branch_name: str = "sovereign-fish-auto") -> str | None:
        del branch_name
        reject_ravens_operation("GitSpoke.ensure_branch")

    def restore_branch(self, original_branch: str | None) -> None:
        del original_branch
        reject_ravens_operation("GitSpoke.restore_branch")

    def commit_changes(self, message: str) -> None:
        del message
        reject_ravens_operation("GitSpoke.commit_changes")


__all__ = ["GitSpoke"]
