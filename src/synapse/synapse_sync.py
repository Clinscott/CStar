"""Retired bidirectional Synapse synchronization surface.

The historical module performed Git, filesystem synchronization, knowledge
harvesting, and noncanonical rate-limit writes.  CStar lifecycle tools now own
state transitions; this compatibility module is intentionally inert.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any


RETIRED_ERROR = "legacy_synapse_sync_retired_use_cstar_kernel_state_surfaces"


class ConfigurationError(Exception):
    """Historical import compatibility exception."""


class PushRateLimiter:
    """No-effect compatibility namespace for the retired file-backed limiter."""

    def __init__(self, core_path: Path) -> None:
        self.path = Path(core_path) / ".synapse_rate_limit.json"

    def check(self) -> tuple[bool, str]:
        return False, RETIRED_ERROR

    def record(self, success: bool) -> None:
        raise RuntimeError(RETIRED_ERROR)


class GitHelper:
    """Stable fail-closed result for retired Git operations."""

    def __init__(self, repo_path: Path) -> None:
        self.path = Path(repo_path)

    def run(self, args: list[str]) -> tuple[bool, str]:
        return False, RETIRED_ERROR

    def check_permissions(self) -> tuple[bool, str]:
        return False, RETIRED_ERROR


class KnowledgeExtractor:
    """Never reads or exports local project knowledge."""

    def __init__(self, project_root: Path, agent_dir: Path) -> None:
        self.root = Path(project_root)
        self.agent = Path(agent_dir)

    def extract_all(self) -> list[dict[str, Any]]:
        return []

    def _extract_corrections(self) -> list[dict[str, Any]]:
        return []

    def _extract_patterns(self) -> list[dict[str, Any]]:
        return []


class Synapse:
    """Compatibility object whose synchronization actions are retired."""

    def __init__(self, remote_alias: str = "primary") -> None:
        self.remote_alias = remote_alias

    def pull(self) -> None:
        raise RuntimeError(RETIRED_ERROR)

    def push(self, dry_run: bool = False) -> None:
        raise RuntimeError(RETIRED_ERROR)

    def _sync_skills(self) -> None:
        raise RuntimeError(RETIRED_ERROR)

    def _sync_corrections(self) -> None:
        raise RuntimeError(RETIRED_ERROR)


def main() -> int:
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
