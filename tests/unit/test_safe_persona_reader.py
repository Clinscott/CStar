from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
READER = ROOT / "scripts" / "read_active_persona.py"


def run_reader(control_root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(READER), str(control_root)],
        capture_output=True,
        text=True,
        check=False,
        timeout=3,
    )


def write_config(root: Path, value: object) -> None:
    agents = root / ".agents"
    agents.mkdir(parents=True, exist_ok=True)
    (agents / "config.json").write_text(json.dumps(value), encoding="utf-8")


def test_reader_emits_only_canonical_odin_scalar(tmp_path: Path) -> None:
    write_config(tmp_path, {
        "system": {"persona": "ODIN"},
        "providerToken": "SECRET_CANARY_MUST_NOT_ESCAPE",
        "nested": {"password": "SECOND_SECRET_CANARY"},
    })
    result = run_reader(tmp_path)
    assert result.returncode == 0
    assert result.stdout == "O.D.I.N."
    assert result.stderr == ""
    assert "CANARY" not in result.stdout + result.stderr


def test_reader_emits_only_canonical_alfred_scalar(tmp_path: Path) -> None:
    write_config(tmp_path, {
        "persona": "A.L.F.R.E.D.",
        "secret": "NEVER_PRINT_THIS",
    })
    result = run_reader(tmp_path)
    assert result.returncode == 0
    assert result.stdout == "A.L.F.R.E.D."
    assert result.stderr == ""


def test_reader_fails_silently_for_invalid_or_malformed_input(tmp_path: Path) -> None:
    for payload in [
        {"activePersona": {"name": "alfred"}, "secret": "CANARY_ONE"},
        {"activePersona": "ALFRED", "secret": "CANARY_TWO"},
        {"activePersona": {"name": "NOT-ALFRED-ADMIN"}, "secret": "CANARY_THREE"},
    ]:
        write_config(tmp_path, payload)
        result = run_reader(tmp_path)
        assert result.returncode != 0
        assert result.stdout == ""
        assert result.stderr == ""
    (tmp_path / ".agents" / "config.json").write_text("{broken", encoding="utf-8")
    result = run_reader(tmp_path)
    assert result.returncode != 0
    assert result.stdout == ""
    assert result.stderr == ""
