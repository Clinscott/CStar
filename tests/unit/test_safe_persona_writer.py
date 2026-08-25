from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WRITER = ROOT / "scripts" / "set_active_persona.py"
READER = ROOT / "scripts" / "read_active_persona.py"
PYTHON = "/usr/bin/python3"
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


def snapshot(config: Path) -> tuple[bytes, tuple[int, int, int, int, int]]:
    current = config.stat()
    return config.read_bytes(), (
        current.st_dev, current.st_ino, current.st_mode, current.st_size, current.st_mtime_ns,
    )


def assert_retired(
    result: subprocess.CompletedProcess[str],
    config: Path,
    before: tuple[bytes, tuple[int, int, int, int, int]],
) -> None:
    assert result.returncode == 2
    assert result.stderr == ""
    assert json.loads(result.stdout) == {"status": "error", "error": RETIRED_ERROR}
    assert "CANARY" not in result.stdout + result.stderr
    assert snapshot(config) == before


def test_writer_switches_exact_state_without_emitting_or_losing_unknown_fields(tmp_path: Path) -> None:
    config = make_config(tmp_path, {
        "system": {"persona": "A.L.F.R.E.D.", "private": "CANARY_SYSTEM"},
        "persona": "ALFRED",
        "Persona": "A.L.F.R.E.D.",
        "activePersona": {"name": "ALFRED", "private": "CANARY_ACTIVE"},
        "unknown": {"token": "CANARY_UNKNOWN"},
    })

    before = snapshot(config)
    assert_retired(run_writer(tmp_path, "O.D.I.N."), config, before)

    reader = subprocess.run(
        [PYTHON, "-I", "-S", "-B", str(READER), str(tmp_path)],
        text=True,
        capture_output=True,
        check=False,
        timeout=5,
    )
    assert reader.returncode == 0
    assert reader.stdout == "A.L.F.R.E.D."


def test_writer_is_idempotent_and_does_not_replace_an_unchanged_file(tmp_path: Path) -> None:
    config = make_config(tmp_path, {"system": {"persona": "O.D.I.N."}})
    before = snapshot(config)
    assert_retired(run_writer(tmp_path, "O.D.I.N."), config, before)
    assert_retired(run_writer(tmp_path, "O.D.I.N."), config, before)


def test_writer_rejects_unsafe_or_structurally_ambiguous_config_without_changes(tmp_path: Path) -> None:
    config = make_config(tmp_path, {"system": "CANARY_NOT_AN_OBJECT"})
    before = snapshot(config)
    assert_retired(run_writer(tmp_path, "A.L.F.R.E.D."), config, before)

    config.chmod(0o622)
    unsafe_before = snapshot(config)
    assert_retired(run_writer(tmp_path, "A.L.F.R.E.D."), config, unsafe_before)


def test_writer_rejects_aliases_and_noncanonical_input(tmp_path: Path) -> None:
    config = make_config(tmp_path, {"system": {"persona": "A.L.F.R.E.D."}})
    before = snapshot(config)
    for value in ("ODIN", "ALFRED", " O.D.I.N.", "NOT-ODIN-ADMIN"):
        assert_retired(run_writer(tmp_path, value), config, before)
