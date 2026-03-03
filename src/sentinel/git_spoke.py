"""
[SPOKE] Git Spoke
Lore: "The Keeper of the Chronology."
Purpose: Encapsulate git operations for the sentinel layer.
"""

import subprocess
from pathlib import Path

class GitSpoke:
    def __init__(self, repo_path: Path):
        self.repo_path = repo_path

    def run_cmd(self, args: list[str]) -> str | None:
        """Executes a git command in the target repo."""
        try:
            result = subprocess.run(
                ["git", *args],
                cwd=str(self.repo_path),
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                check=True
            )
            return result.stdout.strip()
        except (subprocess.CalledProcessError, FileNotFoundError):
            return None

    def is_clean(self) -> bool:
        """Checks if the repo is clean."""
        status = self.run_cmd(["status", "--porcelain"])
        return status == ""

    def ensure_branch(self, branch_name: str = "sovereign-fish-auto") -> str | None:
        """Switches to the dedicated automation branch."""
        current = self.run_cmd(["branch", "--show-current"])
        branches = self.run_cmd(["branch", "--list", branch_name])

        if not branches:
            self.run_cmd(["checkout", "-b", branch_name])
        else:
            self.run_cmd(["checkout", branch_name])

        return current

    def restore_branch(self, original_branch: str | None) -> None:
        """Restores the original branch."""
        if original_branch:
            self.run_cmd(["checkout", original_branch])

    def commit_changes(self, message: str) -> None:
        """Adds all changes and commits with the given message."""
        self.run_cmd(["add", "-A"])
        self.run_cmd(["commit", "-m", message])
