"""Proof that the legacy Mimir harvester is a non-actuating tombstone."""

from __future__ import annotations

import importlib.util
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = PROJECT_ROOT / "scripts" / "mimir_harvester.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("mimir_harvester_tombstone", SCRIPT_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_mimir_harvester_rejects_every_action_without_touching_targets(tmp_path: Path, capsys) -> None:
    module = _load_module()
    target_root = tmp_path / "must-not-exist"
    target_db = target_root / ".stats" / "pennyone.db"

    exit_code = module.main(
        [
            "--db",
            str(target_db),
            "--root",
            str(target_root),
            "--action",
            "consolidate",
            "--nodes-json",
            '[{"level":"TREE","title":"untrusted"}]',
        ]
    )

    assert exit_code == 2
    assert "decommissioned" in capsys.readouterr().err.lower()
    assert not target_root.exists()


def test_mimir_harvester_source_has_no_database_or_filesystem_writer() -> None:
    source = SCRIPT_PATH.read_text(encoding="utf-8")
    forbidden = (
        "import sqlite3",
        "sqlite3.connect",
        "hall_lessons",
        ".mkdir(",
        ".write_text(",
        "open(",
        "subprocess",
    )
    for token in forbidden:
        assert token not in source
