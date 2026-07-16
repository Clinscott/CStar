from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[2]
ERROR = "legacy_direct_hall_script_retired_use_cstar_kernel"


@pytest.mark.parametrize("name", ("mimir_harvester.py", "migrate_hall_schema.py"))
def test_retired_python_hall_script_fails_before_effects(name: str, tmp_path: Path) -> None:
    result = subprocess.run(
        [sys.executable, str(PROJECT_ROOT / "scripts" / name), "--dry-run"],
        cwd=tmp_path,
        check=False,
        capture_output=True,
        text=True,
        env={"PATH": "/nonexistent", "HOME": str(tmp_path)},
    )
    assert result.returncode == 1
    assert result.stdout == ""
    assert result.stderr == f"{ERROR}\n"
    assert list(tmp_path.iterdir()) == []


def test_retired_python_hall_sources_have_no_sqlite_or_hall_implementation() -> None:
    source = "\n".join(
        (PROJECT_ROOT / "scripts" / name).read_text(encoding="utf-8")
        for name in ("mimir_harvester.py", "migrate_hall_schema.py")
    )
    for forbidden in (
        "sqlite3",
        "HallOfRecords",
        "hall_lessons",
        "hall_episodic_memory",
        ".execute(",
        ".commit(",
        "migrate_legacy_records",
    ):
        assert forbidden not in source
