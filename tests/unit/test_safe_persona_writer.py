from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WRITER = ROOT / "scripts" / "set_active_persona.py"
PYTHON = os.environ.get("CSTAR_PYTHON_EXECUTABLE", sys.executable)
RETIRED_ERROR = "persona_config_writer_retired_use_hall_persona_state"


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


def file_identity(path: Path) -> tuple[int, int, int, int, int, int]:
    status = path.stat()
    return (
        status.st_dev,
        status.st_ino,
        status.st_mode,
        status.st_nlink,
        status.st_size,
        status.st_mtime_ns,
    )


def assert_retired(result: subprocess.CompletedProcess[str]) -> None:
    assert result.returncode == 2
    assert result.stderr == ""
    assert "CANARY" not in result.stdout + result.stderr
    assert json.loads(result.stdout) == {"status": "error", "error": RETIRED_ERROR}


def test_writer_switches_exact_state_without_emitting_or_losing_unknown_fields(tmp_path: Path) -> None:
    for ordinal, persona in enumerate(("O.D.I.N.", "A.L.F.R.E.D.")):
        root = tmp_path / str(ordinal)
        root.mkdir()
        config = make_config(root, {
            "system": {"persona": "A.L.F.R.E.D.", "private": "CANARY_SYSTEM"},
            "persona": "ALFRED",
            "Persona": "A.L.F.R.E.D.",
            "activePersona": {"name": "ALFRED", "private": "CANARY_ACTIVE"},
            "unknown": {"token": "CANARY_UNKNOWN"},
        })
        before_bytes = config.read_bytes()
        before_identity = file_identity(config)

        assert_retired(run_writer(root, persona))
        assert config.read_bytes() == before_bytes
        assert file_identity(config) == before_identity


def test_writer_is_idempotent_and_does_not_replace_an_unchanged_file(tmp_path: Path) -> None:
    config = make_config(tmp_path, {"system": {"persona": "O.D.I.N."}})
    before_bytes = config.read_bytes()
    before_identity = file_identity(config)
    first = run_writer(tmp_path, "O.D.I.N.")
    second = run_writer(tmp_path, "O.D.I.N.")

    assert_retired(first)
    assert_retired(second)
    assert config.read_bytes() == before_bytes
    assert file_identity(config) == before_identity


def test_writer_rejects_unsafe_or_structurally_ambiguous_config_without_changes(tmp_path: Path) -> None:
    config = make_config(tmp_path, {"system": "CANARY_NOT_AN_OBJECT"})
    original = config.read_bytes()
    original_identity = file_identity(config)
    result = run_writer(tmp_path, "A.L.F.R.E.D.")
    assert_retired(result)
    assert config.read_bytes() == original
    assert file_identity(config) == original_identity

    config.chmod(0o622)
    unsafe_identity = file_identity(config)
    unsafe = run_writer(tmp_path, "A.L.F.R.E.D.")
    assert_retired(unsafe)
    assert config.read_bytes() == original
    assert file_identity(config) == unsafe_identity


def test_writer_rejects_aliases_and_noncanonical_input(tmp_path: Path) -> None:
    config = make_config(tmp_path, {
        "system": {"persona": "A.L.F.R.E.D.", "private": "CANARY_ALIAS"},
    })
    original = config.read_bytes()
    original_identity = file_identity(config)
    for value in ("ODIN", "ALFRED", " O.D.I.N.", "NOT-ODIN-ADMIN"):
        result = run_writer(tmp_path, value)
        assert_retired(result)
        assert config.read_bytes() == original
        assert file_identity(config) == original_identity
