from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WRITER = ROOT / "scripts" / "set_active_persona.py"
READER = ROOT / "scripts" / "read_active_persona.py"
PYTHON = "/usr/bin/python3"


def make_config(tmp_path: Path, payload: object) -> Path:
    tmp_path.chmod(0o700)
    agents = tmp_path / ".agents"
    agents.mkdir(mode=0o700)
    config = agents / "config.json"
    config.write_text(json.dumps(payload), encoding="utf-8")
    config.chmod(0o600)
    return config


def run_writer(root: Path, persona: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [PYTHON, "-I", "-S", "-B", str(WRITER), str(root), persona],
        text=True,
        capture_output=True,
        check=False,
        timeout=5,
        env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"},
    )


def test_writer_switches_exact_state_without_emitting_or_losing_unknown_fields(tmp_path: Path) -> None:
    config = make_config(tmp_path, {
        "system": {"persona": "A.L.F.R.E.D.", "private": "CANARY_SYSTEM"},
        "persona": "ALFRED",
        "Persona": "A.L.F.R.E.D.",
        "activePersona": {"name": "ALFRED", "private": "CANARY_ACTIVE"},
        "unknown": {"token": "CANARY_UNKNOWN"},
    })

    result = run_writer(tmp_path, "O.D.I.N.")
    assert result.returncode == 0, result.stdout
    assert "CANARY" not in result.stdout + result.stderr
    receipt = json.loads(result.stdout)
    assert receipt["status"] == "updated"
    assert receipt["previous_persona"] == "A.L.F.R.E.D."
    assert receipt["active_persona"] == "O.D.I.N."
    assert receipt["changed"] is True

    stored = json.loads(config.read_text(encoding="utf-8"))
    assert stored["system"] == {"persona": "O.D.I.N.", "private": "CANARY_SYSTEM"}
    assert stored["persona"] == "O.D.I.N."
    assert stored["Persona"] == "O.D.I.N."
    assert stored["activePersona"] == {"name": "O.D.I.N.", "private": "CANARY_ACTIVE"}
    assert stored["unknown"] == {"token": "CANARY_UNKNOWN"}

    reader = subprocess.run(
        [PYTHON, "-I", "-S", "-B", str(READER), str(tmp_path)],
        text=True,
        capture_output=True,
        check=False,
        timeout=5,
    )
    assert reader.returncode == 0
    assert reader.stdout == "O.D.I.N."


def test_writer_is_idempotent_and_does_not_replace_an_unchanged_file(tmp_path: Path) -> None:
    config = make_config(tmp_path, {"system": {"persona": "O.D.I.N."}})
    first = run_writer(tmp_path, "O.D.I.N.")
    assert first.returncode == 0
    before = config.stat()
    second = run_writer(tmp_path, "O.D.I.N.")
    after = config.stat()
    assert second.returncode == 0
    receipt = json.loads(second.stdout)
    assert receipt["status"] == "already_active"
    assert receipt["changed"] is False
    assert (after.st_dev, after.st_ino, after.st_mtime_ns) == (
        before.st_dev, before.st_ino, before.st_mtime_ns,
    )


def test_writer_rejects_unsafe_or_structurally_ambiguous_config_without_changes(tmp_path: Path) -> None:
    config = make_config(tmp_path, {"system": "CANARY_NOT_AN_OBJECT"})
    original = config.read_bytes()
    result = run_writer(tmp_path, "A.L.F.R.E.D.")
    assert result.returncode != 0
    assert json.loads(result.stdout)["error"] == "persona_config_system_invalid"
    assert config.read_bytes() == original

    config.chmod(0o622)
    unsafe = run_writer(tmp_path, "A.L.F.R.E.D.")
    assert unsafe.returncode != 0
    assert json.loads(unsafe.stdout)["error"] == "persona_config_file_unsafe"
    assert config.read_bytes() == original


def test_writer_rejects_aliases_and_noncanonical_input(tmp_path: Path) -> None:
    config = make_config(tmp_path, {"system": {"persona": "A.L.F.R.E.D."}})
    original = config.read_bytes()
    for value in ("ODIN", "ALFRED", " O.D.I.N.", "NOT-ODIN-ADMIN"):
        result = run_writer(tmp_path, value)
        assert result.returncode != 0
        assert json.loads(result.stdout)["error"] == "persona_canonical_value_required"
        assert config.read_bytes() == original
