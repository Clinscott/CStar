"""Deterministic, fail-closed redaction for bounded Researcher evidence.

The R3 lane never serializes source payloads into an evidence receipt.  This
module is deliberately small and has no network, provider, or filesystem
effect.  Sensitive material is recognised only when a contract-designated
key carries a string or byte value.  In particular, Boolean schema metadata
is data, not a secret.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any


REDACTION_MARKER = "[REDACTED]"

# These are contract fields, rather than a general-purpose keyword scanner.
# Keep the set explicit so harmless prose and numeric/Boolean metadata do not
# become accidental redaction failures.
SENSITIVE_KEYS = frozenset(
    {
        "access_token",
        "api_key",
        "apikey",
        "authorization",
        "auth_token",
        "cookie",
        "cookies",
        "credential",
        "credentials",
        "email",
        "html",
        "password",
        "phone",
        "private_key",
        "private_metadata",
        "prompt",
        "raw_html",
        "raw_post",
        "raw_posts",
        "raw_source",
        "raw_source_text",
        "raw_text",
        "refresh_token",
        "secret",
        "secret_key",
        "session_cookie",
        "session_token",
        "source_text",
        "token",
    }
)

# Raw source material is not necessarily secret, but it is not admissible in
# a receipt.  Normalisation drops it and marks the receipt as redacted.  A
# value under one of these keys is still inspected for secret material first.
RAW_SOURCE_KEYS = frozenset(
    {
        "body",
        "content",
        "html",
        "raw_html",
        "raw_post",
        "raw_posts",
        "raw_source",
        "raw_source_text",
        "raw_text",
        "source_text",
    }
)


class RedactionRequired(ValueError):
    """A source record contains material that cannot enter the receipt."""

    code = "REDACTION_REQUIRED"

    def __init__(self, paths: Sequence[str], message: str | None = None) -> None:
        self.paths = tuple(paths)
        detail = message or "contract-designated sensitive material is present"
        super().__init__(f"{self.code}: {detail}")


@dataclass(frozen=True)
class RedactionFinding:
    """A deterministic location of sensitive material in an input record."""

    path: str
    key: str
    value_kind: str


def _key_name(key: Any) -> str:
    if not isinstance(key, str):
        return ""
    return key.strip().casefold().replace("-", "_").replace(" ", "_")


def is_sensitive_key(key: Any) -> bool:
    """Return whether *key* is one of the closed contract sensitive keys."""

    name = _key_name(key)
    if name in SENSITIVE_KEYS:
        return True
    # Contract keys are sometimes versioned (for example ``raw_source_v1``).
    # Only explicit sensitive stems are accepted; this is not a free-form
    # substring detector.
    return name.startswith(("access_token_", "auth_token_", "refresh_token_", "session_token_", "raw_source_"))


def is_raw_source_key(key: Any) -> bool:
    name = _key_name(key)
    return name in RAW_SOURCE_KEYS or name.startswith("raw_source_")


def _is_string_or_bytes(value: Any) -> bool:
    return isinstance(value, (str, bytes, bytearray, memoryview))


def find_sensitive_material(value: Any, *, path: str = "$", _sensitive_context: bool = False) -> tuple[RedactionFinding, ...]:
    """Find secret-bearing values without interpreting Booleans as secrets.

    A sensitive key makes a string/bytes leaf sensitive.  A mapping or a
    sequence below such a key is traversed in the same context.  Integers,
    floats, ``None``, and Booleans are intentionally ignored.
    """

    findings: list[RedactionFinding] = []
    if isinstance(value, Mapping):
        for key in sorted(value, key=lambda item: str(item)):
            child = value[key]
            child_path = f"{path}.{key}" if path != "$" else f"$.{key}"
            sensitive = is_sensitive_key(key) or _sensitive_context
            if sensitive and _is_string_or_bytes(child):
                # Empty strings do not carry material and are safe metadata.
                if len(child) > 0:
                    findings.append(
                        RedactionFinding(child_path, str(key), type(child).__name__)
                    )
                continue
            findings.extend(
                find_sensitive_material(child, path=child_path, _sensitive_context=sensitive)
            )
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray, memoryview)):
        for index, child in enumerate(value):
            child_path = f"{path}[{index}]"
            if _sensitive_context and _is_string_or_bytes(child):
                if len(child) > 0:
                    findings.append(RedactionFinding(child_path, "<sequence>", type(child).__name__))
            else:
                findings.extend(
                    find_sensitive_material(child, path=child_path, _sensitive_context=_sensitive_context)
                )
    return tuple(findings)


def contains_sensitive_material(value: Any) -> bool:
    return bool(find_sensitive_material(value))


def _redact(value: Any, *, path: str, _sensitive_context: bool = False) -> tuple[Any, bool, bool]:
    """Return ``(redacted_value, changed, raw_source_seen)``."""

    if isinstance(value, Mapping):
        changed = False
        raw_seen = False
        result: dict[Any, Any] = {}
        for key in sorted(value, key=lambda item: str(item)):
            child = value[key]
            child_path = f"{path}.{key}" if path != "$" else f"$.{key}"
            sensitive = is_sensitive_key(key) or _sensitive_context
            if is_raw_source_key(key):
                raw_seen = True
            if sensitive and _is_string_or_bytes(child):
                result[key] = REDACTION_MARKER
                changed = True
                continue
            redacted, child_changed, child_raw = _redact(
                child, path=child_path, _sensitive_context=sensitive
            )
            result[key] = redacted
            changed = changed or child_changed
            raw_seen = raw_seen or child_raw
        return result, changed, raw_seen
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray, memoryview)):
        changed = False
        raw_seen = False
        result: list[Any] = []
        for index, child in enumerate(value):
            redacted, child_changed, child_raw = _redact(
                child,
                path=f"{path}[{index}]",
                _sensitive_context=_sensitive_context,
            )
            result.append(redacted)
            changed = changed or child_changed
            raw_seen = raw_seen or child_raw
        return result, changed, raw_seen
    if _sensitive_context and _is_string_or_bytes(value):
        return REDACTION_MARKER, bool(value), False
    # Bytes outside a sensitive field cannot be represented in canonical JSON.
    # Treat them as unsafe rather than guessing an encoding.
    if isinstance(value, (bytes, bytearray, memoryview)):
        return REDACTION_MARKER, bool(value), False
    return value, False, False


def redact_value(value: Any) -> tuple[Any, bool, bool]:
    """Return a deterministic redacted copy and change/raw-source flags."""

    return _redact(value, path="$")


def redact_record(value: Mapping[str, Any], *, fail_on_sensitive: bool = True) -> tuple[dict[str, Any], bool]:
    """Redact a mapping and report whether raw source material was present.

    When ``fail_on_sensitive`` is true (the default), actual non-empty
    string/byte secret values raise :class:`RedactionRequired`.  This lets the
    caller emit a typed abstention instead of silently laundering a secret.
    """

    if not isinstance(value, Mapping):
        raise TypeError("record must be an object")
    findings = find_sensitive_material(value)
    if findings and fail_on_sensitive:
        raise RedactionRequired(tuple(item.path for item in findings))
    redacted, _changed, raw_seen = redact_value(value)
    return dict(redacted), raw_seen


def sanitize_summary(value: Any, *, max_chars: int = 2048) -> str:
    """Validate bounded summary text without exposing raw source material."""

    if not isinstance(value, str) or not value or len(value) > max_chars:
        raise RedactionRequired(("$.summary",), "summary is empty or exceeds its bound")
    if any(ord(char) < 0x20 or ord(char) == 0x7F for char in value):
        raise RedactionRequired(("$.summary",), "summary contains control characters")
    return value


# Friendly aliases used by small host cells and validators.
find_secrets = find_sensitive_material
has_sensitive_material = contains_sensitive_material
redact = redact_record

