from pathlib import Path

import pytest

from src.skills.local.dormancy import RETIREMENT_MESSAGE, main


def test_retired_dormancy_fails_closed_without_writes(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)

    with pytest.raises(SystemExit, match="^Legacy dormancy automation is retired") as error:
        main()

    assert str(error.value) == RETIREMENT_MESSAGE
    assert list(tmp_path.rglob("*")) == []


def test_retired_dormancy_has_no_legacy_autonomous_surfaces() -> None:
    source = (
        Path(__file__).resolve().parents[2] / "src" / "skills" / "local" / "dormancy.py"
    ).read_text(encoding="utf-8")

    for retired_surface in (
        "consolidated_memory",
        "BeadLedger",
        "mimir",
        "subprocess",
        "write_text",
    ):
        assert retired_surface not in source
