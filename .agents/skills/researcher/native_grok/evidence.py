"""Fixture-only non-X source normalisation and typed evidence receipts.

R3 source adapters accept local fixture records only.  They do not contain a
transport client and do not infer authority from a source record.  Every
receipt is bounded, canonical, hash-bound, and explicit about provenance.
"""
from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

try:  # Support both package imports and the repository's direct test runner.
    from .compiler import canonical_bytes, sha256_bytes, sha256_json
    from .redaction import RedactionRequired, find_sensitive_material, redact_record, sanitize_summary
except ImportError:  # pragma: no cover - exercised by direct host imports.
    from compiler import canonical_bytes, sha256_bytes, sha256_json
    from redaction import RedactionRequired, find_sensitive_material, redact_record, sanitize_summary


MODEL = "gpt-5.6-luna"
REASONING = "max"
ACTUAL_IDENTITY = "unreported"
EVIDENCE_SCHEMA = "researcher.evidence_receipt.v1"
CITATION_SCHEMA = "researcher.citation.v1"
ABSTENTION_SCHEMA = "researcher.abstention.v1"
ZERO_SHA256 = "0" * 64
AUTHORITY = {
    "effect_authority": "cstar",
    "lifecycle_authority": "cstar",
    "plugin_output_authority": "evidence_only",
    "result_authority": "cstar",
}
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
HASH_RE = re.compile(r"^[0-9a-f]{64}$")
URI_RE = re.compile(r"^(?:https?|urn):[^\s]{1,2047}$")
DATETIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$")
SAFE_TEXT_RE = re.compile(r"^[^\x00-\x1f\x7f]*$")
CLAIM_STATES = frozenset({"OBSERVED", "INFERRED", "UNAVAILABLE"})
FRESHNESS = frozenset({"current", "not_applicable", "stale", "unknown"})
PERMISSIONS = frozenset({"licensed_read", "local_fixture", "public_read"})


class EvidenceError(ValueError):
    """Typed fail-closed evidence error."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(f"{code}: {message}")


class SourceUnavailable(EvidenceError):
    def __init__(self, message: str) -> None:
        super().__init__("SOURCE_UNAVAILABLE", message)


class CitationInvalid(EvidenceError):
    def __init__(self, message: str) -> None:
        super().__init__("CITATION_INVALID", message)


def _without(value: Mapping[str, Any], key: str) -> dict[str, Any]:
    result = dict(value)
    result.pop(key, None)
    return result


def _hash(value: Any, name: str) -> str:
    if not isinstance(value, str) or HASH_RE.fullmatch(value) is None:
        raise EvidenceError("INVALID_INPUT", f"{name} is not SHA-256")
    return value


def _id(value: Any, name: str) -> str:
    if not isinstance(value, str) or ID_RE.fullmatch(value) is None:
        raise EvidenceError("INVALID_INPUT", f"{name} is not a bounded identifier")
    return value


def _text(value: Any, name: str, maximum: int) -> str:
    if not isinstance(value, str) or not value or len(value) > maximum or SAFE_TEXT_RE.fullmatch(value) is None:
        raise EvidenceError("INVALID_INPUT", f"{name} is not bounded text")
    return value


def _uri(value: Any, name: str) -> str:
    if not isinstance(value, str) or URI_RE.fullmatch(value) is None:
        raise EvidenceError("INVALID_INPUT", f"{name} is not a canonical locator")
    return value


def _datetime(value: Any, name: str) -> str:
    if not isinstance(value, str) or DATETIME_RE.fullmatch(value) is None:
        raise EvidenceError("INVALID_INPUT", f"{name} is not UTC datetime text")
    return value


def _canonical_content(value: Any) -> bytes:
    if isinstance(value, (bytes, bytearray, memoryview)):
        return bytes(value)
    try:
        return canonical_bytes(value)
    except Exception as exc:  # Convert compiler detail to typed evidence failure.
        raise EvidenceError("INVALID_INPUT", "source content is not canonical JSON") from exc


def _non_x(record: Mapping[str, Any]) -> None:
    """Reject a source route that attempts to use the dormant Grok/X lane."""

    route_fields = (
        record.get("source_capability_id", ""),
        record.get("source_group", ""),
        record.get("canonical_locator", ""),
    )
    route = " ".join(str(item).casefold() for item in route_fields)
    if "grok" in route or "twitter.com" in route or "x.com" in route:
        raise SourceUnavailable("R3 fixture adapter does not admit the Grok/X route")


def _counter_zero(record: Mapping[str, Any], key: str) -> None:
    value = record.get(key, 0)
    if isinstance(value, bool) or not isinstance(value, int) or value != 0:
        raise EvidenceError("BUDGET_OVERSHOOT", f"fixture {key} must remain zero")


def _provided_or_derived_hash(record: Mapping[str, Any], key: str, derived: str) -> str:
    if key not in record:
        return derived
    value = _hash(record[key], f"record.{key}")
    if value != derived:
        raise EvidenceError("HASH_MISMATCH", f"record.{key} does not bind source content")
    return value


def _evidence_id(record: Mapping[str, Any], identity: Mapping[str, Any]) -> str:
    if "evidence_id" in record:
        return _id(record["evidence_id"], "record.evidence_id")
    if "record_id" in record:
        return _id(record["record_id"], "record.record_id")
    return f"evidence:{sha256_json(identity)[:48]}"


def _source_status_for_code(code: str) -> str:
    if code in {"CAPABILITY_PROFILE_UNSATISFIED", "AUTH_CUSTODY_UNPROVEN"}:
        return "NOT_ADMITTED__CAPABILITY_UNPROVEN"
    if code in {"SOURCE_UNAVAILABLE", "DEADLINE_EXCEEDED"}:
        return "SOURCE_UNAVAILABLE"
    return "NOT_APPLICABLE"


def build_abstention(
    code: str,
    *,
    reason: str,
    stage: str,
    evidence_refs: Sequence[str] = (),
    bead_id: str = "bead:r3:evidence",
    decision_id: str = "CSO-D003-R3",
    set_id: str = "CSO-D003-R3-SET-01",
    plugin_id: str = "corvus.researcher.platform_neutral",
    source_capability_status: str | None = None,
) -> dict[str, Any]:
    """Build a closed, hash-bound typed abstention."""

    valid_codes = {
        "ATTEMPT_TELEMETRY_UNAVAILABLE", "AUTH_CUSTODY_UNPROVEN", "BUDGET_OVERSHOOT",
        "CAPABILITY_PROFILE_UNSATISFIED", "CANCELLED", "CITATION_INVALID",
        "CORROBORATION_INSUFFICIENT", "DEADLINE_EXCEEDED", "INVALID_INPUT",
        "REDACTION_REQUIRED", "SOURCE_UNAVAILABLE", "TERMINAL_UNKNOWN", "UNKNOWN_FIELD",
    }
    valid_stages = {"admission", "budget", "cancellation", "citation", "deadline", "input", "redaction", "source", "terminal"}
    if code not in valid_codes or stage not in valid_stages:
        raise EvidenceError("INVALID_INPUT", "abstention code or stage is not closed")
    refs = sorted({_id(ref, "evidence_ref") for ref in evidence_refs})
    body = {
        "abstention_id": "pending",
        "actual_identity": ACTUAL_IDENTITY,
        "authority": dict(AUTHORITY),
        "bead_id": _id(bead_id, "bead_id"),
        "code": code,
        "decision_id": _id(decision_id, "decision_id"),
        "evidence_refs": refs,
        "execution_allowed": False,
        "plugin_id": _id(plugin_id, "plugin_id"),
        "reason": _text(reason, "reason", 1024),
        "requested_model": MODEL,
        "requested_reasoning": REASONING,
        "retry_budget": 0,
        "schema": ABSTENTION_SCHEMA,
        "set_id": _id(set_id, "set_id"),
        "source_capability_status": source_capability_status or _source_status_for_code(code),
        "stage": stage,
        "abstention_sha256": ZERO_SHA256,
    }
    body["abstention_id"] = f"abstention:{sha256_json(_without(body, 'abstention_sha256'))[:48]}"
    body["abstention_sha256"] = sha256_json(_without(body, "abstention_sha256"))
    return body


def validate_abstention(value: Mapping[str, Any]) -> bool:
    if not isinstance(value, Mapping) or value.get("schema") != ABSTENTION_SCHEMA:
        raise EvidenceError("INVALID_INPUT", "not an abstention v1 object")
    _hash(value.get("abstention_sha256"), "abstention.abstention_sha256")
    if value["abstention_sha256"] != sha256_json(_without(value, "abstention_sha256")):
        raise EvidenceError("HASH_MISMATCH", "abstention hash mismatch")
    if value.get("execution_allowed") is not False or value.get("actual_identity") != ACTUAL_IDENTITY:
        raise EvidenceError("INVALID_INPUT", "abstention authority fields drifted")
    return True


def normalize_source_record(record: Mapping[str, Any]) -> dict[str, Any]:
    """Convert one local fixture record into a bounded evidence receipt."""

    if not isinstance(record, Mapping):
        raise EvidenceError("INVALID_INPUT", "source record must be an object")
    _non_x(record)
    for counter in ("network_calls", "provider_calls", "model_calls", "tool_calls", "retries", "waits"):
        _counter_zero(record, counter)
    try:
        redacted, raw_seen = redact_record(record, fail_on_sensitive=True)
    except RedactionRequired:
        raise
    source_capability_id = _id(record.get("source_capability_id"), "source_capability_id")
    source_group = _id(record.get("source_group"), "source_group")
    canonical_locator = _uri(record.get("canonical_locator"), "canonical_locator")
    observed_at = _datetime(record.get("observed_at"), "observed_at")
    permission_class = record.get("permission_class", "local_fixture")
    if permission_class not in PERMISSIONS:
        raise EvidenceError("INVALID_INPUT", "permission_class is not closed")
    freshness_status = record.get("freshness_status", "current")
    if freshness_status not in FRESHNESS:
        raise EvidenceError("INVALID_INPUT", "freshness_status is not closed")
    claim_state = record.get("claim_state", "OBSERVED")
    if claim_state not in CLAIM_STATES:
        raise EvidenceError("INVALID_INPUT", "claim_state is not closed")
    summary_value = redacted.get("summary", redacted.get("observation"))
    if summary_value is None:
        summary_value = "Fixture observation is available."
    summary = sanitize_summary(summary_value, max_chars=2048)
    query = record.get("query", "")
    if not isinstance(query, str) or not SAFE_TEXT_RE.fullmatch(query) or len(query) > 4096:
        raise EvidenceError("INVALID_INPUT", "query is not bounded text")
    query_hash = sha256_json(query)
    if "query_hash" in record:
        query_hash = _hash(record["query_hash"], "record.query_hash")
        if query_hash != sha256_json(query):
            raise EvidenceError("HASH_MISMATCH", "record.query_hash does not bind query")
    source_content = record.get("content", record.get("observation", summary))
    content_hash = sha256_bytes(_canonical_content(source_content))
    content_hash = _provided_or_derived_hash(record, "content_hash", content_hash)
    source_receipt_ref = record.get("source_receipt_ref")
    if source_receipt_ref is None:
        source_receipt_ref = f"urn:corvus:fixture:{content_hash[:32]}"
    source_receipt_ref = _text(source_receipt_ref, "source_receipt_ref", 1024)
    source_receipt_hash = sha256_json(
        {
            "canonical_locator": canonical_locator,
            "content_hash": content_hash,
            "observed_at": observed_at,
            "source_receipt_ref": source_receipt_ref,
        }
    )
    source_receipt_hash = _provided_or_derived_hash(record, "source_receipt_hash", source_receipt_hash)
    identity = {
        "canonical_locator": canonical_locator,
        "content_hash": content_hash,
        "source_capability_id": source_capability_id,
        "source_group": source_group,
    }
    evidence_id = _evidence_id(record, identity)
    attempts = record.get("collector_attempt_count", 0)
    if isinstance(attempts, bool) or not isinstance(attempts, int) or attempts not in (0, 1):
        raise EvidenceError("INVALID_INPUT", "collector_attempt_count is not bounded")
    receipt = {
        "actual_identity": ACTUAL_IDENTITY,
        "authority": dict(AUTHORITY),
        "canonical_locator": canonical_locator,
        "claim_state": claim_state,
        "collector_attempt_count": attempts,
        "content_hash": content_hash,
        "credential_material_present": False,
        "evidence_id": evidence_id,
        "evidence_sha256": ZERO_SHA256,
        "freshness_status": freshness_status,
        "observed_at": observed_at,
        "permission_class": permission_class,
        "plugin_output_authority": "evidence_only",
        "private_content_included": False,
        "query_hash": query_hash,
        "raw_source_included": False,
        "redaction_status": "redacted" if raw_seen else "not_required",
        "requested_model": MODEL,
        "requested_reasoning": REASONING,
        "schema": EVIDENCE_SCHEMA,
        "source_capability_id": source_capability_id,
        "source_group": source_group,
        "source_receipt_hash": source_receipt_hash,
        "source_receipt_ref": source_receipt_ref,
        "summary": summary,
    }
    receipt["evidence_sha256"] = sha256_json(_without(receipt, "evidence_sha256"))
    return receipt


def normalize_source_records(records: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Normalise fixture records in a deterministic identity order."""

    if isinstance(records, (str, bytes, bytearray)) or not isinstance(records, Sequence):
        raise EvidenceError("INVALID_INPUT", "records must be an array")
    receipts = [normalize_source_record(record) for record in records]
    return sorted(receipts, key=lambda item: (item["canonical_locator"], item["content_hash"], item["evidence_id"]))


def load_fixture_records(path: str | Path) -> list[dict[str, Any]]:
    """Read a local JSON fixture; no URL or provider path is accepted."""

    fixture_path = Path(path)
    if fixture_path.suffix.casefold() != ".json":
        raise SourceUnavailable("fixture adapter accepts JSON files only")
    try:
        value = json.loads(fixture_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise SourceUnavailable("fixture JSON is unavailable or malformed") from exc
    if not isinstance(value, Mapping) or value.get("schema") != "researcher.r3_non_x_source_records.v1":
        raise EvidenceError("INVALID_INPUT", "fixture schema is not R3 non-X source records v1")
    for counter in ("network_calls", "provider_calls", "model_calls", "tool_calls", "retries", "waits"):
        _counter_zero(value, counter)
    records = value.get("records")
    if not isinstance(records, list):
        raise EvidenceError("INVALID_INPUT", "fixture records must be an array")
    return [dict(record) for record in records if isinstance(record, Mapping)]


def normalize_fixture(path: str | Path) -> list[dict[str, Any]]:
    return normalize_source_records(load_fixture_records(path))


def build_citation(
    evidence: Mapping[str, Any],
    locator_fragment: str,
    *,
    citation_id: str | None = None,
) -> dict[str, Any]:
    """Bind a citation to the exact evidence locator and source receipt."""

    validate_evidence(evidence)
    fragment = _text(locator_fragment, "locator_fragment", 512)
    body = {
        "actual_identity": ACTUAL_IDENTITY,
        "authority": dict(AUTHORITY),
        "canonical_locator": evidence["canonical_locator"],
        "citation_id": citation_id or f"citation:{sha256_json({'evidence_id': evidence['evidence_id'], 'fragment': fragment})[:48]}",
        "citation_sha256": ZERO_SHA256,
        "claim_state": evidence["claim_state"],
        "evidence_id": evidence["evidence_id"],
        "locator_fragment": fragment,
        "observed_at": evidence["observed_at"],
        "requested_model": MODEL,
        "requested_reasoning": REASONING,
        "schema": CITATION_SCHEMA,
        "source_group": evidence["source_group"],
        "source_receipt_hash": evidence["source_receipt_hash"],
    }
    _id(body["citation_id"], "citation_id")
    body["citation_sha256"] = sha256_json(_without(body, "citation_sha256"))
    return body


def validate_evidence(value: Mapping[str, Any]) -> bool:
    """Verify receipt self-hash and protected evidence invariants."""

    if not isinstance(value, Mapping) or value.get("schema") != EVIDENCE_SCHEMA:
        raise EvidenceError("INVALID_INPUT", "not an evidence receipt v1 object")
    _hash(value.get("evidence_sha256"), "evidence.evidence_sha256")
    if value["evidence_sha256"] != sha256_json(_without(value, "evidence_sha256")):
        raise EvidenceError("HASH_MISMATCH", "evidence hash mismatch")
    if value.get("actual_identity") != ACTUAL_IDENTITY:
        raise EvidenceError("INVALID_INPUT", "actual identity is not attested")
    if value.get("raw_source_included") is not False or value.get("private_content_included") is not False or value.get("credential_material_present") is not False:
        raise EvidenceError("REDACTION_REQUIRED", "receipt contains protected material")
    if find_sensitive_material(value):
        raise EvidenceError("REDACTION_REQUIRED", "receipt contains contract-sensitive material")
    return True


def validate_citation(citation: Mapping[str, Any], evidence: Mapping[str, Any]) -> bool:
    """Verify citation hash and all source-observation bindings."""

    try:
        validate_evidence(evidence)
    except EvidenceError as exc:
        raise CitationInvalid(str(exc)) from exc
    if not isinstance(citation, Mapping) or citation.get("schema") != CITATION_SCHEMA:
        raise CitationInvalid("citation schema is not v1")
    if citation.get("citation_sha256") != sha256_json(_without(citation, "citation_sha256")):
        raise CitationInvalid("citation hash mismatch")
    for field in ("evidence_id", "canonical_locator", "source_group", "observed_at", "source_receipt_hash", "claim_state"):
        if citation.get(field) != evidence.get(field):
            raise CitationInvalid(f"citation {field} is not evidence-bound")
    return True


def evidence_identity(value: Mapping[str, Any]) -> tuple[str, str]:
    validate_evidence(value)
    return value["canonical_locator"], value["content_hash"]


# Public aliases make the narrow host surface easy to consume without adding
# another adapter or route.
normalize_evidence = normalize_source_record
normalize_records = normalize_source_records
make_citation = build_citation
typed_abstention = build_abstention

