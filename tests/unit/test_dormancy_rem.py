import asyncio
from pathlib import Path

import pytest

from src.skills.local import dormancy


def test_dormancy_compatibility_surface_is_fail_closed(capsys):
    assert dormancy.main() == 2
    output = capsys.readouterr().out
    assert dormancy.DECOMMISSIONED_CODE in output
    assert "cstar-closeout" in output


def test_dormancy_cycle_rejects_without_writing(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    before = set(Path(tmp_path).rglob("*"))

    with pytest.raises(dormancy.DormancyAutomationDecommissioned):
        asyncio.run(dormancy.consolidated_memory())

    assert set(Path(tmp_path).rglob("*")) == before


def test_dormancy_source_has_no_actuation_imports():
    source = Path(dormancy.__file__).read_text(encoding="utf-8")
    for forbidden in (
        "subprocess",
        "mimir",
        "BeadLedger",
        "write_text(",
        "open(",
        "requests",
    ):
        assert forbidden not in source
