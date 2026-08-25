#!/usr/bin/env python3
"""Atomically set only the bounded CStar persona inside the local config."""

from __future__ import annotations

import hashlib
import json
import os
import stat
import sys
from pathlib import Path
from typing import Any

MAX_CONFIG_BYTES = 1_048_576
CANONICAL = {"O.D.I.N.", "A.L.F.R.E.D."}
ALIASES = {
    "ODIN": "O.D.I.N.",
    "O.D.I.N.": "O.D.I.N.",
    "ALFRED": "A.L.F.R.E.D.",
    "A.L.F.R.E.D.": "A.L.F.R.E.D.",
}


class PersonaWriteError(Exception):
    """Stable, value-free persona mutation failure."""


def fail(code: str) -> None:
    raise PersonaWriteError(code)


def assert_safe_directory(path: Path) -> None:
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or path.is_symlink():
        fail("persona_config_directory_unsafe")
    if info.st_uid != os.getuid() or info.st_mode & 0o022:
        fail("persona_config_directory_unsafe")


def read_config(config_path: Path) -> tuple[dict[str, Any], bytes, os.stat_result]:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(config_path, flags)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            fail("persona_config_file_unsafe")
        if info.st_uid != os.getuid() or info.st_mode & 0o022:
            fail("persona_config_file_unsafe")
        chunks: list[bytes] = []
        total = 0
        while total <= MAX_CONFIG_BYTES:
            chunk = os.read(descriptor, min(65_536, MAX_CONFIG_BYTES + 1 - total))
            if not chunk:
                break
            chunks.append(chunk)
            total += len(chunk)
        raw = b"".join(chunks)
    finally:
        os.close(descriptor)
    if len(raw) > MAX_CONFIG_BYTES:
        fail("persona_config_too_large")
    try:
        parsed = json.loads(raw.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError):
        fail("persona_config_invalid")
    if not isinstance(parsed, dict):
        fail("persona_config_invalid")
    return parsed, raw, info


def existing_persona(parsed: dict[str, Any]) -> str | None:
    system = parsed.get("system")
    active = parsed.get("activePersona")
    candidates = [
        system.get("persona") if isinstance(system, dict) else None,
        parsed.get("persona"),
        parsed.get("Persona"),
        active.get("name") if isinstance(active, dict) else None,
    ]
    resolved = {
        ALIASES[value]
        for value in candidates
        if isinstance(value, str) and value in ALIASES
    }
    return resolved.pop() if len(resolved) == 1 else None


def set_persona_fields(parsed: dict[str, Any], persona: str) -> None:
    system = parsed.get("system")
    if system is None:
        system = {}
        parsed["system"] = system
    if not isinstance(system, dict):
        fail("persona_config_system_invalid")
    system["persona"] = persona
    for key in ("persona", "Persona"):
        if isinstance(parsed.get(key), str) and parsed.get(key) in ALIASES:
            parsed[key] = persona
    active = parsed.get("activePersona")
    if (
        isinstance(active, dict)
        and isinstance(active.get("name"), str)
        and active.get("name") in ALIASES
    ):
        active["name"] = persona


def atomic_replace(config_path: Path, raw: bytes, original: os.stat_result) -> None:
    current = config_path.lstat()
    identity = ("st_dev", "st_ino", "st_size", "st_ctime_ns", "st_mtime_ns")
    if any(getattr(current, field) != getattr(original, field) for field in identity):
        fail("persona_config_changed_during_write")
    temporary = config_path.parent / f".{config_path.name}.cstar-persona-{os.getpid()}"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    descriptor: int | None = None
    try:
        descriptor = os.open(temporary, flags, 0o600)
        view = memoryview(raw)
        while view:
            written = os.write(descriptor, view)
            view = view[written:]
        os.fsync(descriptor)
        os.fchmod(descriptor, stat.S_IMODE(original.st_mode))
        os.close(descriptor)
        descriptor = None
        os.replace(temporary, config_path)
        directory = os.open(config_path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def set_active_persona(control_root: Path, persona: str) -> dict[str, Any]:
    if persona not in CANONICAL:
        fail("persona_canonical_value_required")
    if not control_root.is_absolute():
        fail("persona_control_root_not_absolute")
    control_root = control_root.resolve(strict=True)
    assert_safe_directory(control_root)
    agents_root = control_root / ".agents"
    assert_safe_directory(agents_root)
    config_path = agents_root / "config.json"
    parsed, original_raw, original = read_config(config_path)
    previous = existing_persona(parsed)
    set_persona_fields(parsed, persona)
    updated_raw = (json.dumps(parsed, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    if len(updated_raw) > MAX_CONFIG_BYTES:
        fail("persona_config_too_large")
    changed = updated_raw != original_raw
    if changed:
        atomic_replace(config_path, updated_raw, original)
    return {
        "schema": "cstar.persona_set.v1",
        "status": "updated" if changed else "already_active",
        "previous_persona": previous,
        "active_persona": persona,
        "changed": changed,
        "config_sha256": hashlib.sha256(updated_raw).hexdigest(),
    }


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        return 2
    try:
        result = set_active_persona(Path(argv[1]), argv[2])
    except PersonaWriteError as error:
        sys.stdout.write(json.dumps({"status": "error", "error": str(error)}))
        return 2
    except (OSError, TypeError, ValueError):
        sys.stdout.write(json.dumps({"status": "error", "error": "persona_config_write_failed"}))
        return 3
    sys.stdout.write(json.dumps(result, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
