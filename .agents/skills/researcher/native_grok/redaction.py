#!/usr/bin/env python3
"""Deterministic, source-only redaction gates for Researcher R3."""
from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any


SENSITIVE_KEYS = frozenset(
    {
        "api_key", "apikey", "authorization", "auth_header", "bearer",
        "client_secret", "cookie", "cookies", "credential", "credentials",
        "email", "html", "password", "phone", "private", "private_key",
        "prompt", "raw", "raw_html", "raw_post", "raw_source", "raw_text",
        "refresh_token", "secret", "secrets", "session", "token", "access_token",
        "content", "body", "contact", "contact_data", "post", "posts",
    }
)
NUMERIC_MATERIAL_KEYS = frozenset({"metric", "metrics", "raw_metric", "raw_metrics", "numeric_metric"})
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_SECRET_RE = re.compile(
    r"(?:-----BEGIN [^-]*PRIVATE KEY-----|\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]+|"
    r"\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]\s*[^\s,;]+)",
    re.IGNORECASE,
)


class RedactionRequired(ValueError):
    """The input contains material that cannot enter a bounded receipt."""

    code = "REDACTION_REQUIRED"

    def __init__(self, paths: Sequence[str], message: str | None = None) -> None:
        self.paths = tuple(paths)
        super().__init__(message or "sensitive material requires redaction")


def _key_name(key: Any) -> str:
    return key.casefold().replace("-", "_") if isinstance(key, str) else ""


def _has_string_or_bytes(value: Any) -> bool:
    if isinstance(value, bool) or value is None:
        return False
    if isinstance(value, (str, bytes, bytearray)):
        return len(value) > 0
    if isinstance(value, Mapping):
        return any(_has_string_or_bytes(item) for item in value.values())
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return any(_has_string_or_bytes(item) for item in value)
    return False


def _secret_text(value: Any) -> bool:
    if isinstance(value, (bytes, bytearray)):
        try:
            text = bytes(value).decode("utf-8", errors="ignore")
        except Exception:
            return True
    elif isinstance(value, str):
        text = value
    else:
        return False
    return bool(_SECRET_RE.search(text))


def _walk_sensitive(value: Any, path: str, paths: list[str], sensitive_keys: frozenset[str]) -> None:
    if isinstance(value, Mapping):
        for key, child in value.items():
            name = _key_name(key)
            child_path = f"{path}.{key}" if path else str(key)
            # Boolean metadata is deliberately not material, even when the
            # contract key contains words such as credential, raw, or private.
            if name in sensitive_keys and _has_string_or_bytes(child):
                paths.append(child_path)
            if name in NUMERIC_MATERIAL_KEYS and isinstance(child, (int, float)) and not isinstance(child, bool):
                paths.append(child_path)
            if _secret_text(child):
                paths.append(child_path)
            _walk_sensitive(child, child_path, paths, sensitive_keys)
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        for index, child in enumerate(value):
            _walk_sensitive(child, f"{path}[{index}]", paths, sensitive_keys)
    elif isinstance(value, (bytes, bytearray)):
        paths.append(path or "$")


def sensitive_paths(value: Any, *, sensitive_keys: frozenset[str] = SENSITIVE_KEYS) -> list[str]:
    """Return deterministic paths containing contract-designated material."""
    found: list[str] = []
    _walk_sensitive(value, "", found, frozenset(_key_name(key) for key in sensitive_keys))
    return sorted(set(found))


def contains_sensitive_material(value: Any, *, sensitive_keys: frozenset[str] = SENSITIVE_KEYS) -> bool:
    return bool(sensitive_paths(value, sensitive_keys=sensitive_keys))


def assert_safe(value: Any, *, sensitive_keys: frozenset[str] = SENSITIVE_KEYS) -> None:
    paths = sensitive_paths(value, sensitive_keys=sensitive_keys)
    if paths:
        raise RedactionRequired(paths)


def validate_bounded_text(value: Any, *, max_chars: int = 2048, name: str = "text") -> str:
    if not isinstance(value, str) or not value or len(value) > max_chars or _CONTROL_RE.search(value):
        raise ValueError(f"{name} is not bounded text")
    assert_safe({"summary": value})
    return value


def redact_payload(value: Any, *, sensitive_keys: frozenset[str] = SENSITIVE_KEYS) -> Any:
    """Remove unsafe fields without retaining their values.

    This helper is deterministic for diagnostics.  Receipt construction still
    calls :func:`assert_safe` and abstains instead of silently accepting data.
    """
    keys = frozenset(_key_name(key) for key in sensitive_keys)
    if isinstance(value, Mapping):
        result: dict[Any, Any] = {}
        for key, child in value.items():
            name = _key_name(key)
            if name in keys and _has_string_or_bytes(child):
                continue
            if _secret_text(child):
                continue
            result[key] = redact_payload(child, sensitive_keys=keys)
        return result
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [redact_payload(child, sensitive_keys=keys) for child in value]
    if isinstance(value, (bytes, bytearray)):
        return None
    return value


def safe_summary(value: Any, *, max_chars: int = 2048) -> str:
    """Validate the only human-readable field allowed into evidence."""
    return validate_bounded_text(value, max_chars=max_chars, name="summary")

