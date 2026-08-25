from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[2]
ENTRIES = {
    "assurance.py": "legacy_assurance_retired_use_cstar_doctor",
    "bookmark_weaver.py": "legacy_bookmark_weaver_retired_use_cstar_researcher",
    "hermes_p1_scan.py": "legacy_autonomous_scan_retired_use_cstar_researcher",
    "harvest_intents.py": "legacy_autonomous_scan_retired_use_cstar_researcher",
}


@pytest.mark.parametrize(("name", "error"), ENTRIES.items())
def test_retired_python_automation_fails_before_effects(
    name: str,
    error: str,
    tmp_path: Path,
) -> None:
    entry = PROJECT_ROOT / "scripts" / name
    result = subprocess.run(
        [sys.executable, str(entry), str(tmp_path)],
        cwd=tmp_path,
        check=False,
        capture_output=True,
        text=True,
        env={"PATH": "/nonexistent", "HOME": str(tmp_path)},
    )
    assert result.returncode == 1
    assert result.stdout == ""
    assert result.stderr == f"{error}\n"
    assert list(tmp_path.iterdir()) == []


def test_retired_sources_contain_no_secret_source_provider_or_hall_primitives() -> None:
    source = "\n".join(
        (PROJECT_ROOT / "scripts" / name).read_text(encoding="utf-8")
        for name in ENTRIES
    )
    for forbidden in (
        "x_session.json",
        "load_cookies",
        "get_bookmarks",
        "AntigravityUplink",
        "mimir.think",
        "BeadLedger",
        "HallOfRecords",
        "SovereignBead",
        ".touch(",
        ".write_text(",
        "subprocess",
    ):
        assert forbidden not in source
