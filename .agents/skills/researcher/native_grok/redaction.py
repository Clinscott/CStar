#!/usr/bin/env python3
"""Deterministic source-record redaction for the Researcher R3 lane.

This module is deliberately local and side-effect free. It accepts already
available fixture records and returns bounded metadata. It never opens a
source, reads credentials, or writes a receipt.
"""
from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

MAX_SUMMARY_CHARS = 2000
REDACTED = "[REDACTED]"
REDACTED_HTML = "[REDACTED_HTML]"
REDACTED_NUMBER = "[REDACTED_NUMBER]"


class RedactionError(ValueError):
    """A source value cannot be represented safely in a receipt."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(f"{code}: {message}")


_SECRET_PATTERNS = (
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]+"),
    re.compile(r"(?i)\b(?:api[_ -]?key|access[_ -]?token|secret|password|credential)\s*[:=]\s*\S+"),
    re.compile(r"\b(?:sk|xai|ghp|github_pat|glpat|npm_[A-Za-z0-9]+)-[A-Za-z0-9._-]{8,}\b"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"),
    re.compile(r"(?i)\bcookie\s*[:=]\s*\S+"),
)
_CONTACT_PATTERNS = (
    re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
    re.compile(r"(?<!\d)(?:\+?1[ .-]?)?(?:\(?\d{3}\)?[ .-])\d{3}[ .-]\d{4}(?!\d)"),
)
_PROMPT_PATTERN = re.compile(r"(?is)\b(?:system|developer|user)\s+prompt\s*[:=].*")
_HTML_PATTERN = re.compile(r"(?is)<(?:script|style|iframe|html|body)\b[^>]*>.*?</(?:script|style|iframe|html|body)>")
_TAG_PATTERN = re.compile(r"(?is)<[^>]{1,4096}>")
_CONTROL_PATTERN = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_SECRET_KEY_PATTERN = re.compile(
    r"(?i)(?:secret|password|passwd|token|cookie|authorization|api[_-]?key|credential|private[_-]?key|"
    r"access[_-]?key|session[_-]?id|prompt|raw[_-]?source|raw[_-]?html|raw[_-]?body|contact|email|phone)"
)
_RAW_KEY_PATTERN = re.compile(
    r"(?i)^(?:raw|body|response|payload|post|html|html_body|raw_source|raw_html|raw_body|"
    r"content|source_content|source_text|text|prompt|cookie|headers?|contact|email|phone|"
    r"private_metadata|private_content)$"
)
_NUMERIC_KEY_PATTERN = re.compile(
    r"(?i)(?:count|total|score|rank|metric|number|numeric|size|duration|latency|followers|"
    r"engagement|views|likes|shares|replies|limit|offset|percent|ratio)"
)
_SAFE_TEXT_PATTERN = re.compile(r"^[^\x00-\x1f\x7f]*$")
_SAFE_METADATA_KEYS = {
    "credential_material_present",
    "private_content_included",
    "raw_source_included",
    "source_capability_id",
    "source_group",
    "source_receipt_hash",
    "source_receipt_ref",
    "content_hash",
    "query_hash",
}


def _key_is_sensitive(key: str) -> bool:
    return bool(_SECRET_KEY_PATTERN.search(key))


def _key_is_raw(key: str) -> bool:
    return bool(_RAW_KEY_PATTERN.fullmatch(key))


def _key_is_numeric_metric(key: str) -> bool:
    return bool(_NUMERIC_KEY_PATTERN.search(key))


def redact_text(value: str, *, max_chars: int = MAX_SUMMARY_CHARS) -> str:
    """Return bounded deterministic text with unsafe material removed."""
    if not isinstance(value, str):
        raise RedactionError("INVALID_INPUT", "text must be a string")
    if not isinstance(max_chars, int) or isinstance(max_chars, bool) or not 1 <= max_chars <= MAX_SUMMARY_CHARS:
        raise RedactionError("INVALID_INPUT", "max_chars is outside the bounded summary limit")
    if not _SAFE_TEXT_PATTERN.fullmatch(value):
        raise RedactionError("REDACTION_REQUIRED", "control characters are not allowed")

    result = _HTML_PATTERN.sub(REDACTED_HTML, value)
    result = _TAG_PATTERN.sub(REDACTED_HTML, result)
    result = _PROMPT_PATTERN.sub(REDACTED, result)
    for pattern in _SECRET_PATTERNS:
        result = pattern.sub(REDACTED, result)
    for pattern in _CONTACT_PATTERNS:
        result = pattern.sub(REDACTED, result)
    result = " ".join(result.split())
    if len(result) > max_chars:
        result = result[: max_chars - len(" …")] + " …"
    if not result:
        raise RedactionError("REDACTION_REQUIRED", "text is empty after redaction")
    return result


def _sanitize(value: Any, *, key: str = "", path: str = "$", removed: list[str]) -> Any:
    if key and (_key_is_sensitive(key) or _key_is_raw(key)):
        removed.append(path)
        return None
    if isinstance(value, Mapping):
        result: dict[str, Any] = {}
        for child_key in sorted(value):
            if not isinstance(child_key, str) or not child_key:
                removed.append(f"{path}.<invalid-key>")
                continue
            child = value[child_key]
            if _key_is_sensitive(child_key) or _key_is_raw(child_key):
                removed.append(f"{path}.{child_key}")
                continue
            if _key_is_numeric_metric(child_key) and isinstance(child, (int, float)) and not isinstance(child, bool):
                removed.append(f"{path}.{child_key}")
                continue
            sanitized = _sanitize(child, key=child_key, path=f"{path}.{child_key}", removed=removed)
            if sanitized is not None:
                result[child_key] = sanitized
        return result
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        result_list = []
        for index, child in enumerate(value):
            sanitized = _sanitize(child, path=f"{path}[{index}]", removed=removed)
            if sanitized is not None:
                result_list.append(sanitized)
        return result_list
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, (bool, int, float)) or value is None:
        return value
    removed.append(path)
    return None


def redact_mapping(value: Mapping[str, Any]) -> tuple[dict[str, Any], tuple[str, ...]]:
    """Redact a mapping and return a safe mapping and removed paths."""
    if not isinstance(value, Mapping):
        raise RedactionError("INVALID_INPUT", "record must be an object")
    removed: list[str] = []
    safe = _sanitize(value, removed=removed)
    if not isinstance(safe, dict):
        raise RedactionError("REDACTION_REQUIRED", "record is not representable")
    assert_safe(safe)
    return safe, tuple(sorted(set(removed)))


def redact_source_record(value: Mapping[str, Any]) -> dict[str, Any]:
    """Return a safe bounded projection of a source record.

    Raw content and all sensitive or unbounded fields are intentionally absent.
    The caller may retain a hash of the pre-redaction content.
    """
    safe, removed = redact_mapping(value)
    safe["_redaction_status"] = "redacted" if removed else "not_required"
    safe["_redacted_fields"] = list(removed)
    return safe


def contains_sensitive_material(value: Any) -> bool:
    """Return whether a value still contains a known secret/private marker."""
    if isinstance(value, Mapping):
        for key, child in value.items():
            if isinstance(key, str) and key not in _SAFE_METADATA_KEYS and (_key_is_sensitive(key) or _key_is_raw(key)):
                return True
            if contains_sensitive_material(child):
                return True
        return False
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return any(contains_sensitive_material(child) for child in value)
    if isinstance(value, str):
        if any(pattern.search(value) for pattern in _SECRET_PATTERNS):
            return True
        if any(pattern.search(value) for pattern in _CONTACT_PATTERNS):
            return True
        if _HTML_PATTERN.search(value) or _PROMPT_PATTERN.search(value):
            return True
    return False


def assert_safe(value: Any) -> None:
    """Fail closed if unsafe source material remains."""
    if contains_sensitive_material(value):
        raise RedactionError("REDACTION_REQUIRED", "sensitive or private material remains")


def redaction_status(original: Mapping[str, Any], safe: Mapping[str, Any]) -> str:
    """Return the deterministic ABI status for a redacted record."""
    if not isinstance(original, Mapping) or not isinstance(safe, Mapping):
        raise RedactionError("INVALID_INPUT", "redaction status expects mappings")
    return "not_required" if dict(original) == dict(safe) else "redacted"


redact_record = redact_source_record
sanitize_record = redact_source_record

__all__ = [
    "MAX_SUMMARY_CHARS",
    "REDACTED",
    "REDACTED_HTML",
    "RedactionError",
    "assert_safe",
    "contains_sensitive_material",
    "redact_mapping",
    "redact_record",
    "redact_source_record",
    "redact_text",
    "redaction_status",
    "sanitize_record",
]
