from pathlib import Path

import pytest

from src.core.synapse_db import (
    RETIRED_SYNAPSE_DB_ERROR,
    ensure_healthy_synapse_db,
)


def test_python_synapse_writer_fails_before_filesystem_or_sqlite(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match=f"^{RETIRED_SYNAPSE_DB_ERROR}$"):
        ensure_healthy_synapse_db(tmp_path / "synapse.db")
    assert list(tmp_path.iterdir()) == []


def test_python_synapse_source_has_no_effectful_implementation() -> None:
    source = (Path(__file__).resolve().parents[2] / "src/core/synapse_db.py").read_text(
        encoding="utf-8"
    )
    for forbidden in ("sqlite3", "os.replace", ".mkdir(", ".connect(", ".execute("):
        assert forbidden not in source
