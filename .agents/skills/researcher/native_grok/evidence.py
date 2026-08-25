#!/usr/bin/env python3
"""Fixture-only non-X source normalization and citation binding for R3."""
from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping, Sequence
from typing import Any

try:  # Package import when installed as a module.
    from .redaction import RedactionRequired, assert_safe, safe_summary
except ImportError:  # Direct import used by the bounded fixture test.
    from redaction import RedactionRequired, assert_safe, safe_summary


MODEL = "gpt-5.6-luna"
REASONING = "max"
CANONICAL_ENCODING = "sorted-key-utf8-final-lf"
AUTHORITY = {
    "effect_authority": "cstar",
    "lifecycle_authority": "cstar",
    "plugin_output_authority": "evidence_only",
    "result_authority": "cstar",
}
EVIDENCE_SCHEMA = "researcher.evidence_receipt.v1"
CITATION_SCHEMA = "researcher.citation.v1"
ZERO_SHA256 = "0" * 64
_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_SHA_RE = re.compile(r"^[0-9a-f]{64}$")
_TEXT_RE = re.compile(r"^[^\x00-\x1f\x7f]*$")
_URI_RE = re.compile(r"^(?:https?|urn):[^\s]{1,2047}$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$")
EVIDENCE_KEYS = frozenset(
    {
        "actual_identity", "authority", "canonical_locator", "claim_state",
        "collector_attempt_count", "content_hash", "credential_material_present",
        "evidence_id", "evidence_sha256", "freshness_status", "observed_at",
        "permission_class", "plugin_output_authority", "private_content_included",
        "query_hash", "raw_source_included", "redaction_status", "requested_model",
        "requested_reasoning", "schema", "source_capability_id", "source_group",
        "source_receipt_hash", "source_receipt_ref", "summary",
    }
)
CITATION_KEYS = frozenset(
    {
        "actual_identity", "authority", "canonical_locator", "citation_id",
        "citation_sha256", "claim_state", "evidence_id", "locator_fragment",
        "observed_at", "requested_model", "requested_reasoning", "schema",
        "source_group", "source_receipt_hash",
    }
)
INPUT_KEYS = frozenset(
    {
        "canonical_locator", "claim_state", "collector_attempt_count", "content",
        "content_hash", "evidence_id", "freshness_status", "metadata", "observed_at",
        "permission_class", "query", "query_hash", "redaction_status",
        "source_capability_id", "source_group", "source_receipt_hash",
        "source_receipt_ref", "summary", "record_id",
    }
)


class EvidenceError(ValueError):
    """Typed fail-closed normalization or validation error."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(f"{code}: {message}")


def canonical_bytes(value: Any) -> bytes:
    try:
        raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    except (TypeError, ValueError) as exc:
        raise EvidenceError("INVALID_INPUT", "value is not canonical JSON") from exc
    return (raw + "\n").encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_json(value: Any) -> str:
    return sha256_bytes(canonical_bytes(value))


def _without(value: Mapping[str, Any], key: str) -> dict[str, Any]:
    result = dict(value)
    result.pop(key, None)
    return result


def _id(value: Any, name: str) -> str:
    if not isinstance(value, str) or _ID_RE.fullmatch(value) is None:
        raise EvidenceError("INVALID_INPUT", f"{name} is not a verified identifier")
    return value


def _sha(value: Any, name: str) -> str:
    if not isinstance(value, str) or _SHA_RE.fullmatch(value) is None:
        raise EvidenceError("INVALID_INPUT", f"{name} is not SHA-256")
    return value


def _text(value: Any, name: str, maximum: int) -> str:
    if not isinstance(value, str) or not value or len(value) > maximum or _TEXT_RE.fullmatch(value) is None:
        raise EvidenceError("INVALID_INPUT", f"{name} is not bounded text")
    return value


def _uri(value: Any, name: str) -> str:
    if not isinstance(value, str) or _URI_RE.fullmatch(value) is None:
        raise EvidenceError("INVALID_INPUT", f"{name} is not a canonical locator")
    return value


def _datetime(value: Any, name: str) -> str:
    if not isinstance(value, str) or _DATE_RE.fullmatch(value) is None:
        raise EvidenceError("INVALID_INPUT", f"{name} is not UTC time")
    return value


def _bound(value: Mapping[str, Any], key: str, name: str) -> None:
    expected = sha256_json(_without(value, key))
    if value.get(key) != expected:
        raise EvidenceError("HASH_MISMATCH", f"{name}.{key} is not hash-bound")


def validate_evidence(value: Mapping[str, Any]) -> bool:
    if not isinstance(value, Mapping):
        raise EvidenceError("INVALID_INPUT", "evidence must be an object")
    item = dict(value)
    if set(item) != set(EVIDENCE_KEYS):
        raise EvidenceError("UNKNOWN_FIELD" if set(item) - set(EVIDENCE_KEYS) else "INVALID_INPUT", "evidence fields are not closed")
    required = EVIDENCE_KEYS
    if set(item) != required:
        raise EvidenceError("INVALID_INPUT", "evidence required fields are incomplete")
    if item["schema"] != EVIDENCE_SCHEMA or item["actual_identity"] != "unreported" or item["requested_model"] != MODEL or item["requested_reasoning"] != REASONING:
        raise EvidenceError("INVALID_INPUT", "evidence identity or schema drift")
    if item["authority"] != AUTHORITY or item["plugin_output_authority"] != "evidence_only":
        raise EvidenceError("CAPABILITY_PROFILE_UNSATISFIED", "evidence authority drift")
    _id(item["evidence_id"], "evidence_id"); _id(item["source_capability_id"], "source_capability_id"); _id(item["source_group"], "source_group")
    _uri(item["canonical_locator"], "canonical_locator"); _text(item["source_receipt_ref"], "source_receipt_ref", 1024); _text(item["summary"], "summary", 2048)
    _datetime(item["observed_at"], "observed_at")
    for key in ("content_hash", "evidence_sha256", "query_hash", "source_receipt_hash"):
        _sha(item[key], key)
    if item["claim_state"] not in {"OBSERVED", "INFERRED", "UNAVAILABLE"} or item["freshness_status"] not in {"current", "not_applicable", "stale", "unknown"}:
        raise EvidenceError("INVALID_INPUT", "evidence enum drift")
    if item["permission_class"] not in {"licensed_read", "local_fixture", "public_read"} or item["redaction_status"] not in {"not_required", "redacted"}:
        raise EvidenceError("INVALID_INPUT", "evidence permission or redaction drift")
    if isinstance(item["collector_attempt_count"], bool) or not isinstance(item["collector_attempt_count"], int) or not 0 <= item["collector_attempt_count"] <= 1:
        raise EvidenceError("INVALID_INPUT", "collector attempt count is not bounded")
    for key in ("credential_material_present", "private_content_included", "raw_source_included"):
        if item[key] is not False:
            raise EvidenceError("REDACTION_REQUIRED", f"{key} is true")
    assert_safe(item)
    _bound(item, "evidence_sha256", "evidence")
    return True


def _source_id(record: Mapping[str, Any]) -> str:
    value = record.get("evidence_id", record.get("record_id"))
    if value is not None:
        return _id(value, "record_id")
    return "evidence-" + sha256_json(record)[:24]


def _hash_content(record: Mapping[str, Any], summary: str) -> str:
    if "content_hash" in record:
        return _sha(record["content_hash"], "content_hash")
    if "content" in record:
        # Raw source is never an accepted evidence input, even in a fixture.
        raise RedactionRequired(["content"])
    return sha256_bytes(summary.encode("utf-8"))


def normalize_source_record(
    record: Mapping[str, Any],
    *,
    source_capability_id: str = "fixture.public",
    source_group: str = "fixture-local",
    observed_at: str = "2026-08-15T12:00:00Z",
    permission_class: str = "local_fixture",
    query: str = "bounded fixture query",
) -> dict[str, Any]:
    """Convert one bounded fixture record into a closed evidence receipt."""
    if not isinstance(record, Mapping):
        raise EvidenceError("INVALID_INPUT", "source record must be an object")
    raw = dict(record)
    assert_safe(raw)
    unknown = sorted(set(raw) - set(INPUT_KEYS))
    if unknown:
        raise EvidenceError("UNKNOWN_FIELD", f"source record field {unknown[0]} is not declared")
    evidence_id = _source_id(raw)
    summary = raw.get("summary", f"Bounded fixture observation at {raw.get('canonical_locator', evidence_id)}.")
    try:
        summary = safe_summary(summary, max_chars=2048)
    except RedactionRequired:
        raise
    except ValueError as exc:
        raise EvidenceError("INVALID_INPUT", str(exc)) from exc
    locator = raw.get("canonical_locator", f"urn:corvus:fixture:{evidence_id}")
    _uri(locator, "canonical_locator")
    capability = raw.get("source_capability_id", source_capability_id)
    group = raw.get("source_group", source_group)
    _id(capability, "source_capability_id"); _id(group, "source_group")
    stamp = raw.get("observed_at", observed_at); _datetime(stamp, "observed_at")
    perm = raw.get("permission_class", permission_class)
    if perm not in {"licensed_read", "local_fixture", "public_read"}:
        raise EvidenceError("INVALID_INPUT", "permission_class is not supported")
    query_value = raw.get("query", query)
    if not isinstance(query_value, str) or not query_value or _TEXT_RE.fullmatch(query_value) is None:
        raise EvidenceError("INVALID_INPUT", "query is not bounded text")
    query_hash = raw.get("query_hash", sha256_bytes(query_value.encode("utf-8")))
    _sha(query_hash, "query_hash")
    content_hash = _hash_content(raw, summary)
    receipt_ref = raw.get("source_receipt_ref", f"urn:corvus:fixture-receipt:{evidence_id}")
    _text(receipt_ref, "source_receipt_ref", 1024)
    receipt_hash = raw.get("source_receipt_hash", sha256_json({"content_hash": content_hash, "source_receipt_ref": receipt_ref}))
    _sha(receipt_hash, "source_receipt_hash")
    attempts = raw.get("collector_attempt_count", 0)
    if isinstance(attempts, bool) or not isinstance(attempts, int) or not 0 <= attempts <= 1:
        raise EvidenceError("INVALID_INPUT", "collector_attempt_count is not bounded")
    state = raw.get("claim_state", "OBSERVED")
    if state not in {"OBSERVED", "INFERRED", "UNAVAILABLE"}:
        raise EvidenceError("INVALID_INPUT", "claim_state is not closed")
    result = {
        "actual_identity": "unreported", "authority": dict(AUTHORITY), "canonical_locator": locator,
        "claim_state": state, "collector_attempt_count": attempts, "content_hash": content_hash,
        "credential_material_present": False, "evidence_id": evidence_id, "evidence_sha256": ZERO_SHA256,
        "freshness_status": raw.get("freshness_status", "current"), "observed_at": stamp,
        "permission_class": perm, "plugin_output_authority": "evidence_only", "private_content_included": False,
        "query_hash": query_hash, "raw_source_included": False, "redaction_status": raw.get("redaction_status", "not_required"),
        "requested_model": MODEL, "requested_reasoning": REASONING, "schema": EVIDENCE_SCHEMA,
        "source_capability_id": capability, "source_group": group, "source_receipt_hash": receipt_hash,
        "source_receipt_ref": receipt_ref, "summary": summary,
    }
    result["evidence_sha256"] = sha256_json(_without(result, "evidence_sha256"))
    validate_evidence(result)
    return result


def normalize_fixture_records(records: Sequence[Mapping[str, Any]], **defaults: Any) -> list[dict[str, Any]]:
    if not isinstance(records, Sequence) or isinstance(records, (str, bytes, bytearray)):
        raise EvidenceError("INVALID_INPUT", "fixture records must be an array")
    return [normalize_source_record(record, **defaults) for record in records]


def make_citation(evidence: Mapping[str, Any], *, locator_fragment: str = "fixture-observation") -> dict[str, Any]:
    validate_evidence(evidence)
    try:
        fragment = safe_summary(locator_fragment, max_chars=512)
    except (ValueError, RedactionRequired) as exc:
        raise EvidenceError("CITATION_INVALID", "locator fragment is not bounded") from exc
    citation = {
        "actual_identity": "unreported", "authority": dict(AUTHORITY), "canonical_locator": evidence["canonical_locator"],
        "citation_id": "citation-" + evidence["evidence_id"], "citation_sha256": ZERO_SHA256,
        "claim_state": evidence["claim_state"], "evidence_id": evidence["evidence_id"], "locator_fragment": fragment,
        "observed_at": evidence["observed_at"], "requested_model": MODEL, "requested_reasoning": REASONING,
        "schema": CITATION_SCHEMA, "source_group": evidence["source_group"], "source_receipt_hash": evidence["source_receipt_hash"],
    }
    citation["citation_sha256"] = sha256_json(_without(citation, "citation_sha256"))
    validate_citation(citation, evidence)
    return citation


def validate_citation(value: Mapping[str, Any], evidence: Mapping[str, Any] | None = None) -> bool:
    if not isinstance(value, Mapping) or set(value) != set(CITATION_KEYS):
        raise EvidenceError("CITATION_INVALID", "citation fields are not closed")
    item = dict(value)
    if item["schema"] != CITATION_SCHEMA or item["actual_identity"] != "unreported" or item["requested_model"] != MODEL or item["requested_reasoning"] != REASONING:
        raise EvidenceError("CITATION_INVALID", "citation identity drift")
    if item["authority"] != AUTHORITY or item["claim_state"] not in {"OBSERVED", "INFERRED", "UNAVAILABLE"}:
        raise EvidenceError("CITATION_INVALID", "citation authority or state drift")
    _id(item["citation_id"], "citation_id"); _id(item["evidence_id"], "evidence_id"); _id(item["source_group"], "source_group")
    _uri(item["canonical_locator"], "canonical_locator"); _text(item["locator_fragment"], "locator_fragment", 512); _datetime(item["observed_at"], "observed_at")
    _sha(item["source_receipt_hash"], "source_receipt_hash"); _sha(item["citation_sha256"], "citation_sha256")
    assert_safe(item); _bound(item, "citation_sha256", "citation")
    if evidence is not None:
        validate_evidence(evidence)
        for key in ("evidence_id", "canonical_locator", "claim_state", "observed_at", "source_group", "source_receipt_hash"):
            if item[key] != evidence[key]:
                raise EvidenceError("CITATION_INVALID", f"citation does not bind {key}")
    return True


def normalize_non_x_source_records(records: Sequence[Mapping[str, Any]], **defaults: Any) -> list[dict[str, Any]]:
    return normalize_fixture_records(records, **defaults)


build_evidence = normalize_source_record
build_citation = make_citation
validate_evidence_receipt = validate_evidence

