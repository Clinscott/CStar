#!/usr/bin/env python3
"""Retired source-rewriting Muninn migration helper."""

from pathlib import Path


RETIRED_ERROR = "legacy_fix_muninn_retired_use_reviewed_patch_workflow"


def standardize_muninn(filepath: Path) -> None:
    """Fail closed without reading or rewriting source."""
    raise RuntimeError(RETIRED_ERROR)


def main() -> int:
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
