from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WRITER = ROOT / "scripts" / "set_active_persona.py"
PYTHON = os.environ["CSTAR_PYTHON_EXECUTABLE"]
RETIRED_ERROR = "persona_config_writer_retired_use_hall_persona_state"
BOUND_ENV = {
    "PATH": "/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE": "1", "PYTHONNOUSERSITE": "1",
    "PYTHONHASHSEED": "0", "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8",
    "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "CSTAR_PYTHON_EXECUTABLE": PYTHON,
}


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
        env=BOUND_ENV,
    )


def snapshot(config: Path) -> tuple[bytes, tuple[int, ...]]:
    observed = config.stat()
    identity = (
        observed.st_mode, observed.st_uid, observed.st_gid, observed.st_dev,
        observed.st_ino, observed.st_nlink, observed.st_size, observed.st_mtime_ns,
    )
    return config.read_bytes(), identity


def test_writer_switches_exact_state_without_emitting_or_losing_unknown_fields(tmp_path: Path) -> None:
    config = make_config(tmp_path, {
        "system": {"persona": "A.L.F.R.E.D.", "private": "CANARY_SYSTEM"},
        "persona": "ALFRED",
        "Persona": "A.L.F.R.E.D.",
        "activePersona": {"name": "ALFRED", "private": "CANARY_ACTIVE"},
        "unknown": {"token": "CANARY_UNKNOWN"},
    })

    before = snapshot(config)
    result = run_writer(tmp_path, "O.D.I.N.")
    assert result.returncode == 2
    assert "CANARY" not in result.stdout + result.stderr
    receipt = json.loads(result.stdout)
    assert receipt == {"status": "error", "error": RETIRED_ERROR}
    assert result.stderr == ""
    assert snapshot(config) == before


def test_writer_is_idempotent_and_does_not_replace_an_unchanged_file(tmp_path: Path) -> None:
    config = make_config(tmp_path, {"system": {"persona": "O.D.I.N."}})
    before = snapshot(config)
    first = run_writer(tmp_path, "O.D.I.N.")
    second = run_writer(tmp_path, "O.D.I.N.")
    assert first.returncode == second.returncode == 2
    assert first.stdout == second.stdout
    assert json.loads(first.stdout) == {"status": "error", "error": RETIRED_ERROR}
    assert "CANARY" not in first.stdout + first.stderr + second.stdout + second.stderr
    assert snapshot(config) == before


def test_writer_rejects_unsafe_or_structurally_ambiguous_config_without_changes(tmp_path: Path) -> None:
    config = make_config(tmp_path, {"system": "CANARY_NOT_AN_OBJECT"})
    original = snapshot(config)
    result = run_writer(tmp_path, "A.L.F.R.E.D.")
    assert result.returncode == 2
    assert json.loads(result.stdout)["error"] == RETIRED_ERROR
    assert "CANARY" not in result.stdout + result.stderr
    assert snapshot(config) == original

    config.chmod(0o622)
    unsafe_original = snapshot(config)
    unsafe = run_writer(tmp_path, "A.L.F.R.E.D.")
    assert unsafe.returncode == 2
    assert json.loads(unsafe.stdout)["error"] == RETIRED_ERROR
    assert "CANARY" not in unsafe.stdout + unsafe.stderr
    assert snapshot(config) == unsafe_original


def test_writer_rejects_aliases_and_noncanonical_input(tmp_path: Path) -> None:
    config = make_config(tmp_path, {"system": {"persona": "A.L.F.R.E.D."}})
    original = snapshot(config)
    for value in ("ODIN", "ALFRED", " O.D.I.N.", "NOT-ODIN-ADMIN"):
        result = run_writer(tmp_path, value)
        assert result.returncode == 2
        assert json.loads(result.stdout)["error"] == RETIRED_ERROR
        assert "CANARY" not in result.stdout + result.stderr
        assert snapshot(config) == original
