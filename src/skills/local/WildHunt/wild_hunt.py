#!/usr/bin/env python3
"""Read-only local skill lookup plus a fail-closed acquisition tombstone.

The former Wild Hunt cloned repositories and promoted their contents directly
into ``.agents/skills``.  That execution lane is retired.  ``search`` remains
available only as a bounded filesystem lookup; it performs no network access or
write and treats decommissioned and symlinked directories as non-discoverable.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


DECOMMISSION_MARKER = "DECOMMISSIONED.md"
DECOMMISSION_MESSAGE = (
    "Wild Hunt ingestion is decommissioned. Use the current host skill-first "
    "workflow and CStar lifecycle for any proposal, build, validation, or promotion."
)


class SkillIngestionDecommissioned(RuntimeError):
    """Raised when a caller reaches the retired clone/promote API."""


class WildHunt:
    """Compatibility facade with read-only local search and no ingestion path."""

    def __init__(self, root: Path | None = None) -> None:
        self.root = root.resolve() if root is not None else Path(__file__).resolve().parents[4]
        self.active_skills = self.root / ".agents" / "skills"
        self.skills_db = self.root / "skills_db"

    @staticmethod
    def _visible_directories(root: Path) -> list[Path]:
        if not root.is_dir() or root.is_symlink():
            return []
        return sorted(
            (
                entry
                for entry in root.iterdir()
                if not entry.name.startswith(".")
                and not entry.is_symlink()
                and entry.is_dir()
                and not (entry / DECOMMISSION_MARKER).exists()
            ),
            key=lambda entry: entry.name.casefold(),
        )

    def search(self, query: str) -> list[str]:
        """Search existing local skill names without invoking a network or writing."""
        needle = query.strip().casefold()
        if not needle:
            return []

        results = [
            f"[ACTIVE] {entry.name}"
            for entry in self._visible_directories(self.active_skills)
            if needle in entry.name.casefold()
        ]
        results.extend(
            f"[REFERENCE] {entry.name}"
            for entry in self._visible_directories(self.skills_db)
            if needle in entry.name.casefold()
        )
        return results

    def ingest(self, url: str, skill_name: str) -> None:
        """Reject the retired clone/promote lane before inspecting its arguments."""
        del url, skill_name
        raise SkillIngestionDecommissioned(DECOMMISSION_MESSAGE)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Read-only local skill lookup; remote ingestion is retired",
    )
    parser.add_argument("command", choices=["search", "ingest"])
    parser.add_argument("target", help="Local search query or ignored legacy URL")
    parser.add_argument("--name", help="Ignored legacy skill name")
    args = parser.parse_args()

    hunter = WildHunt()
    if args.command == "search":
        for match in hunter.search(args.target):
            print(match)
        return 0

    try:
        hunter.ingest(args.target, args.name or "")
    except SkillIngestionDecommissioned as error:
        print(str(error), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
