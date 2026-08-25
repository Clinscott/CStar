"""Read-only MiniMax OAuth resolver for the sealed CStar Forge runtime.

This module intentionally has no dependency on the general Hermes auth stack.
It mirrors Hermes' read-only per-provider lookup order: the isolated
``cstar-hub`` store shadows the global store, and the global store is consulted
only when the profile has no MiniMax OAuth entry. It never refreshes or
persists credentials and exposes no secret-bearing diagnostics.
"""

from __future__ import annotations

import json
import os
import stat
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROFILE = "cstar-hub"
PROVIDER = "minimax-oauth"
AUTH_MODE = "oauth"
CLIENT_ID = "78257093-7e40-4613-99e0-527b14b39113"
PORTAL_BASE_URL = "https://api.minimax.io"
INFERENCE_BASE_URL = "https://api.minimax.io/anthropic"
REQUIRED_SCOPE = frozenset({"group_id", "profile", "model.completion"})
OAUTH_HORIZON_SECONDS = 2100
_AUTH_STORE_CAP = 256 * 1024
_TOKEN_CAP = 32 * 1024


class ForgeMiniMaxOAuthError(RuntimeError):
    """Value-free error carrying only a stable Forge failure code."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


class ForgeMiniMaxOAuthCredential:
    """In-process bearer value with an explicitly redacted representation."""

    __slots__ = ("_access_token",)

    def __init__(self, access_token: str) -> None:
        self._access_token = access_token

    @property
    def access_token(self) -> str:
        """Return the bearer only to the sealed request function."""
        return self._access_token

    def __repr__(self) -> str:
        return "ForgeMiniMaxOAuthCredential(<redacted>)"

    def status(
        self,
        *,
        horizon_started_unix_ms: int,
        required_until_unix_ms: int,
        horizon_binding_sha256: str,
    ) -> dict[str, object]:
        """Return the exact token-free readiness projection."""
        return {
            "schema": "hermes.forge_minimax_oauth_status.v2",
            "status": "ready",
            "provider": PROVIDER,
            "auth_mode": AUTH_MODE,
            "profile": PROFILE,
            "refresh_required": False,
            "horizon_seconds": OAUTH_HORIZON_SECONDS,
            "horizon_started_unix_ms": horizon_started_unix_ms,
            "required_until_unix_ms": required_until_unix_ms,
            "horizon_binding_sha256": horizon_binding_sha256,
        }


def _fail(code: str) -> ForgeMiniMaxOAuthError:
    return ForgeMiniMaxOAuthError(code)


def _identity(item: os.stat_result) -> tuple[int, ...]:
    return (
        item.st_dev,
        item.st_ino,
        item.st_uid,
        item.st_mode,
        item.st_nlink,
        item.st_size,
        item.st_mtime_ns,
    )


def _profile_home() -> Path:
    raw = os.environ.get("HERMES_HOME", "")
    if not raw or not os.path.isabs(raw):
        raise _fail("forge_entrypoint_oauth_profile_invalid")
    expected = Path.home() / ".hermes" / "profiles" / PROFILE
    if Path(os.path.normpath(raw)) != expected:
        raise _fail("forge_entrypoint_oauth_profile_invalid")
    for directory in (expected.parent.parent, expected.parent, expected):
        try:
            metadata = os.lstat(directory)
        except OSError as exc:
            raise _fail("forge_entrypoint_oauth_profile_unavailable") from exc
        if (
            stat.S_ISLNK(metadata.st_mode)
            or not stat.S_ISDIR(metadata.st_mode)
            or metadata.st_uid != os.geteuid()
            or stat.S_IMODE(metadata.st_mode) & 0o022
        ):
            raise _fail("forge_entrypoint_oauth_profile_unsafe")
    return expected


def _read_auth_store(
    auth_path: Path,
    *,
    missing_ok: bool = False,
) -> dict[str, Any] | None:
    try:
        lexical_before = os.lstat(auth_path)
    except FileNotFoundError:
        if missing_ok:
            return None
        raise _fail("forge_entrypoint_oauth_store_unavailable")
    except OSError as exc:
        raise _fail("forge_entrypoint_oauth_store_unavailable") from exc
    mode = stat.S_IMODE(lexical_before.st_mode)
    if (
        stat.S_ISLNK(lexical_before.st_mode)
        or not stat.S_ISREG(lexical_before.st_mode)
        or lexical_before.st_uid != os.geteuid()
        or lexical_before.st_nlink != 1
        or mode not in {0o400, 0o600}
        or lexical_before.st_size <= 0
        or lexical_before.st_size > _AUTH_STORE_CAP
    ):
        raise _fail("forge_entrypoint_oauth_store_unsafe")

    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    descriptor: int | None = None
    try:
        descriptor = os.open(auth_path, flags)
        opened = os.fstat(descriptor)
        if _identity(opened) != _identity(lexical_before):
            raise _fail("forge_entrypoint_oauth_store_changed")
        chunks: list[bytes] = []
        remaining = opened.st_size
        while remaining:
            chunk = os.read(descriptor, min(remaining, 64 * 1024))
            if not chunk:
                raise _fail("forge_entrypoint_oauth_store_changed")
            chunks.append(chunk)
            remaining -= len(chunk)
        opened_after = os.fstat(descriptor)
        lexical_after = os.lstat(auth_path)
        if _identity(opened) != _identity(opened_after) or _identity(opened) != _identity(lexical_after):
            raise _fail("forge_entrypoint_oauth_store_changed")
        raw = b"".join(chunks)
    except ForgeMiniMaxOAuthError:
        raise
    except OSError as exc:
        raise _fail("forge_entrypoint_oauth_store_unavailable") from exc
    finally:
        if descriptor is not None:
            try:
                os.close(descriptor)
            except OSError:
                pass

    try:
        payload = json.loads(raw.decode("utf-8", errors="strict"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise _fail("forge_entrypoint_oauth_store_invalid") from exc
    if not isinstance(payload, dict):
        raise _fail("forge_entrypoint_oauth_store_invalid")
    return payload


def _provider_state(store: dict[str, Any]) -> dict[str, Any] | None:
    if "providers" not in store:
        return None
    providers = store["providers"]
    if not isinstance(providers, dict):
        raise _fail("forge_entrypoint_oauth_store_invalid")
    if PROVIDER not in providers:
        return None
    state = providers[PROVIDER]
    if not isinstance(state, dict):
        raise _fail("forge_entrypoint_oauth_store_invalid")
    return state


def _resolve_provider_state(profile_home: Path) -> dict[str, Any]:
    profile_store = _read_auth_store(
        profile_home / "auth.json",
        missing_ok=True,
    )
    profile_state = _provider_state(profile_store) if profile_store is not None else None
    if profile_state is not None:
        return profile_state

    global_store = _read_auth_store(
        profile_home.parent.parent / "auth.json",
        missing_ok=True,
    )
    global_state = _provider_state(global_store) if global_store is not None else None
    if global_state is None:
        raise _fail("forge_entrypoint_oauth_provider_missing")
    return global_state


def _parse_expiry(value: Any) -> datetime:
    if not isinstance(value, str) or not value.strip() or value != value.strip():
        raise _fail("forge_entrypoint_oauth_contract_invalid")
    candidate = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError as exc:
        raise _fail("forge_entrypoint_oauth_contract_invalid") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise _fail("forge_entrypoint_oauth_contract_invalid")
    return parsed.astimezone(timezone.utc)


def resolve_forge_minimax_oauth(
    *,
    required_until_unix_ms: int,
    now: datetime | None = None,
) -> ForgeMiniMaxOAuthCredential:
    """Resolve a bearer valid through one immutable request horizon."""
    if type(required_until_unix_ms) is not int or required_until_unix_ms <= 0:
        raise _fail("forge_entrypoint_oauth_contract_invalid")
    current = datetime.now(timezone.utc) if now is None else now
    if current.tzinfo is None or current.utcoffset() is None:
        raise _fail("forge_entrypoint_oauth_contract_invalid")

    state = _resolve_provider_state(_profile_home())
    fixed_fields = {
        "provider": PROVIDER,
        "region": "global",
        "portal_base_url": PORTAL_BASE_URL,
        "inference_base_url": INFERENCE_BASE_URL,
        "client_id": CLIENT_ID,
        "token_type": "Bearer",
    }
    if any(state.get(name) != expected for name, expected in fixed_fields.items()):
        raise _fail("forge_entrypoint_oauth_contract_invalid")
    scope = state.get("scope")
    if not isinstance(scope, str) or frozenset(scope.split()) != REQUIRED_SCOPE:
        raise _fail("forge_entrypoint_oauth_contract_invalid")
    token = state.get("access_token")
    if (
        not isinstance(token, str)
        or not token
        or token != token.strip()
        or len(token.encode("utf-8")) > _TOKEN_CAP
        or any(ord(character) < 33 or ord(character) > 126 for character in token)
    ):
        raise _fail("forge_entrypoint_oauth_contract_invalid")
    expires_at = _parse_expiry(state.get("expires_at"))
    current_unix_ms = int(current.astimezone(timezone.utc).timestamp() * 1000)
    expiry_unix_ms = int(expires_at.timestamp() * 1000)
    if required_until_unix_ms <= current_unix_ms or expiry_unix_ms < required_until_unix_ms:
        raise _fail("forge_entrypoint_oauth_refresh_required")
    return ForgeMiniMaxOAuthCredential(token)


def forge_minimax_oauth_status(
    *,
    horizon_started_unix_ms: int,
    required_until_unix_ms: int,
    horizon_binding_sha256: str,
) -> dict[str, object]:
    """Resolve readiness and discard the bearer before returning metadata."""
    credential = resolve_forge_minimax_oauth(
        required_until_unix_ms=required_until_unix_ms,
    )
    return credential.status(
        horizon_started_unix_ms=horizon_started_unix_ms,
        required_until_unix_ms=required_until_unix_ms,
        horizon_binding_sha256=horizon_binding_sha256,
    )
