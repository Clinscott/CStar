"""Fail when quarantined-test scope changes without an explicit review."""

from __future__ import annotations

import hashlib
from pathlib import Path


EXPECTED_FILE_COUNT = 121
EXPECTED_PATH_SHA256 = "038d1d16924105b3eaa4218ae0593724b22839958326b981f27f6097813492f1"
EXECUTABLE_SUFFIXES = {".py", ".ts", ".sh"}


def test_quarantine_inventory_is_frozen_and_documented() -> None:
    quarantine = Path(__file__).resolve().parents[1] / "quarantine"
    paths = sorted(
        path.relative_to(quarantine).as_posix()
        for path in quarantine.rglob("*")
        if path.is_file() and path.suffix in EXECUTABLE_SUFFIXES
    )
    digest = hashlib.sha256(("\n".join(paths) + "\n").encode()).hexdigest()

    assert len(paths) == EXPECTED_FILE_COUNT, (
        "Quarantine inventory changed. Review tests/quarantine/README.md and "
        "classify every added, promoted, retired, or moved file explicitly."
    )
    assert digest == EXPECTED_PATH_SHA256, (
        "Quarantine path set changed without a governed inventory update."
    )


def test_quarantine_policy_forbids_counting_excluded_files_as_green() -> None:
    policy = (Path(__file__).resolve().parents[1] / "quarantine" / "README.md").read_text()

    assert "excluded evidence" in policy
    assert "all-tests" in policy
    assert "major-model" in policy
