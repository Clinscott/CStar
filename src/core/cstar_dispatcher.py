"""Fail-closed tombstone for the retired Python dynamic command dispatcher.

The canonical CLI is the Node/TypeScript `cstar` entrypoint. Filesystem
discovery of arbitrary Python scripts and Quarto workflows bypassed registry,
CStar, operator, and Forge gates, so it is intentionally unavailable.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


DECOMMISSIONED_ERROR = (
    "python_dynamic_dispatcher_permanently_decommissioned: use the canonical "
    "cstar CLI, a registered host skill, or a bounded cstar-kernel tool"
)


class CorvusDispatcher:
    """Compatibility object that exposes no executable command discovery."""

    def __init__(self, root: Path | None = None) -> None:
        self.project_root = root or Path(__file__).resolve().parents[2]

    def _discover_all(self) -> dict[str, str]:
        """Return no commands; filesystem-discovered execution is retired."""
        return {}

    def show_help(self) -> None:
        """Print the bounded migration instruction without scanning files."""
        print(DECOMMISSIONED_ERROR)

    def run(self, _args: list[str]) -> None:
        """Refuse every stale invocation without spawning or writing."""
        raise RuntimeError(DECOMMISSIONED_ERROR)

    def _execute_skill(self, _skill_name: str, _args: list[str]) -> None:
        """Refuse the former internal recursion path."""
        raise RuntimeError(DECOMMISSIONED_ERROR)


def main() -> int:
    print(json.dumps({
        "status": "blocked",
        "error": DECOMMISSIONED_ERROR,
        "execution_attempted": False,
    }, sort_keys=True))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
