"""Token-free, hash-chained provider-dispatch evidence for CStar Forge."""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
from pathlib import Path
from typing import Any


SCHEMA = "cstar.forge_provider_journal.v1"
STATES = (
    "not_reached",
    "capability_consumed",
    "dispatch_attempted",
    "request_sent",
    "response_headers_received",
    "response_body_complete",
)
_BINDING_ENV = "CSTAR_FORGE_PROVIDER_JOURNAL_BINDING_SHA256"
_PATH_ENV = "CSTAR_FORGE_PROVIDER_JOURNAL_PATH"
_ZERO_DIGEST = "0" * 64
_JOURNAL_CAP = 64 * 1024
_EVENT_KEYS = {
    "binding_sha256", "event_sha256", "previous_sha256",
    "schema", "sequence", "state",
}


class ForgeProviderJournalError(RuntimeError):
    """Stable, value-free journal failure."""

    def __init__(self) -> None:
        super().__init__("forge_entrypoint_provider_journal_invalid")


def _invalid() -> ForgeProviderJournalError:
    return ForgeProviderJournalError()


def _canonical(value: dict[str, Any]) -> bytes:
    return json.dumps(
        value, ensure_ascii=True, separators=(",", ":"), sort_keys=True,
    ).encode("ascii")


def _identity(item: os.stat_result) -> tuple[int, ...]:
    return (
        item.st_dev, item.st_ino, item.st_uid, item.st_mode,
        item.st_nlink, item.st_size, item.st_mtime_ns,
    )


def _event(binding: str, sequence: int, state_name: str, previous: str) -> dict[str, Any]:
    base = {
        "binding_sha256": binding,
        "previous_sha256": previous,
        "schema": SCHEMA,
        "sequence": sequence,
        "state": state_name,
    }
    return {**base, "event_sha256": hashlib.sha256(_canonical(base)).hexdigest()}


def _context() -> tuple[Path, str]:
    raw_path = os.environ.get(_PATH_ENV, "")
    binding = os.environ.get(_BINDING_ENV, "")
    if not os.path.isabs(raw_path) or not re.fullmatch(r"[a-f0-9]{64}", binding):
        raise _invalid()
    path = Path(os.path.normpath(raw_path))
    try:
        parent = os.lstat(path.parent)
    except OSError as exc:
        raise _invalid() from exc
    if (
        stat.S_ISLNK(parent.st_mode)
        or not stat.S_ISDIR(parent.st_mode)
        or parent.st_uid != os.geteuid()
        or stat.S_IMODE(parent.st_mode) & 0o077
    ):
        raise _invalid()
    return path, binding


def _read(path: Path, binding: str) -> tuple[list[dict[str, Any]], os.stat_result]:
    try:
        lexical = os.lstat(path)
    except OSError as exc:
        raise _invalid() from exc
    if (
        stat.S_ISLNK(lexical.st_mode)
        or not stat.S_ISREG(lexical.st_mode)
        or lexical.st_uid != os.geteuid()
        or lexical.st_nlink != 1
        or stat.S_IMODE(lexical.st_mode) != 0o600
        or lexical.st_size <= 0
        or lexical.st_size > _JOURNAL_CAP
    ):
        raise _invalid()
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
        opened = os.fstat(descriptor)
        if _identity(opened) != _identity(lexical):
            raise _invalid()
        raw = os.read(descriptor, _JOURNAL_CAP + 1)
        after = os.fstat(descriptor)
        if len(raw) > _JOURNAL_CAP or _identity(opened) != _identity(after):
            raise _invalid()
    except ForgeProviderJournalError:
        raise
    except OSError as exc:
        raise _invalid() from exc
    finally:
        if "descriptor" in locals():
            os.close(descriptor)
    try:
        lines = raw.decode("ascii", errors="strict").splitlines()
        events = [json.loads(line) for line in lines]
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise _invalid() from exc
    if not events or len(events) > len(STATES):
        raise _invalid()
    previous = _ZERO_DIGEST
    for sequence, item in enumerate(events):
        if not isinstance(item, dict) or set(item) != _EVENT_KEYS:
            raise _invalid()
        expected = _event(binding, sequence, STATES[sequence], previous)
        if item != expected:
            raise _invalid()
        previous = item["event_sha256"]
    return events, lexical


def append_provider_state(state_name: str) -> None:
    """Append and fsync exactly the next state in the sealed journal."""
    path, binding = _context()
    events, lexical = _read(path, binding)
    sequence = len(events)
    if sequence >= len(STATES) or state_name != STATES[sequence]:
        raise _invalid()
    item = _event(binding, sequence, state_name, events[-1]["event_sha256"])
    encoded = _canonical(item) + b"\n"
    flags = (
        os.O_WRONLY | os.O_APPEND | getattr(os, "O_CLOEXEC", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    try:
        descriptor = os.open(path, flags)
        opened = os.fstat(descriptor)
        if _identity(opened) != _identity(lexical):
            raise _invalid()
        offset = 0
        while offset < len(encoded):
            written = os.write(descriptor, encoded[offset:])
            if written <= 0:
                raise _invalid()
            offset += written
        os.fsync(descriptor)
    except ForgeProviderJournalError:
        raise
    except OSError as exc:
        raise _invalid() from exc
    finally:
        if "descriptor" in locals():
            os.close(descriptor)
