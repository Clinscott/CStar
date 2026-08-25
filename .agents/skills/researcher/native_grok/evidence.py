from __future__ import annotations
import copy
import re
from collections.abc import Iterable, Mapping, Sequence
from typing import Any
try:
    from .compiler import canonical_bytes, sha256_bytes, sha256_json
except ImportError:  # pragma: no cover - direct focused-test import
    from compiler import canonical_bytes, sha256_bytes, sha256_json
try:
    from .redaction import (
        MAX_SUMMARY_CHARS,
        RedactionError,
        assert_safe,
        contains_sensitive_material,
        redact_source_record,
        redact_text,
    )
except ImportError:  # pragma: no cover - direct focused-test import
    from redaction import (
        MAX_SUMMARY_CHARS,
        RedactionError,
        assert_safe,
        contains_sensitive_material,
        redact_source_record,
        redact_text,
    )
MODEL = "gpt-5.6-luna"
REASONING = "max"
ACTUAL_IDENTITY = "unreported"
CANONICAL_ENCODING = "sorted-key-utf8-final-lf"
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
SOURCE_GROUP_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
ID_RE = SOURCE_GROUP_RE
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
DATETIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$")
URI_RE = re.compile(r"^(?:https?|urn):[^\s]{1,2047}$")
TEXT_RE = re.compile(r"^[^\x00-\x1f\x7f]*$")
NON_X_FORBIDDEN_RE = re.compile(r"(?i)(?:grok|hermes|minimax|browser|direct[_ -]?api|provider|network|x[_ -]?route|xai)")
class EvidenceError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(f"{code}: {message}")
def _mapping(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise EvidenceError("INVALID_INPUT", f"{name} must be an object")
    return dict(value)
def _text(value: Any, name: str, *, maximum: int = 2048) -> str:
    if not isinstance(value, str) or not value or len(value) > maximum or TEXT_RE.fullmatch(value) is None:
        raise EvidenceError("INVALID_INPUT", f"{name} is not bounded text")
    return value
def _id(value: Any, name: str) -> str:
    if not isinstance(value, str) or ID_RE.fullmatch(value) is None:
        raise EvidenceError("INVALID_INPUT", f"{name} is not an identifier")
    return value
def _sha(value: Any, name: str) -> str:
    if not isinstance(value, str) or SHA_RE.fullmatch(value) is None:
        raise EvidenceError("INVALID_INPUT", f"{name} is not SHA-256")
    return value
def _hash_without(value: Mapping[str, Any], field: str) -> str:
    body = dict(value)
    body.pop(field, None)
    return sha256_json(body)
def _bind(value: Mapping[str, Any], field: str) -> dict[str, Any]:
    result = dict(value)
    result[field] = _hash_without(result, field)
    return result
def _verify_binding(value: Mapping[str, Any], field: str, name: str) -> None:
    _sha(value.get(field), f"{name}.{field}")
    if value[field] != _hash_without(value, field):
        raise EvidenceError("HASH_MISMATCH", f"{name}.{field} is not bound")
def canonical_content_hash(value: Any) -> str:
    return sha256_bytes(canonical_bytes(value))
def canonical_query_hash(query: Any) -> str:
    if isinstance(query, str):
        return sha256_bytes(query.encode("utf-8"))
    return canonical_content_hash(query)
def _is_non_x_identifier(value: str) -> bool:
    return bool(NON_X_FORBIDDEN_RE.search(value))
def _require_non_x(record: Mapping[str, Any]) -> None:
    for key in ("source_capability_id", "plugin_id", "adapter", "route", "provider", "tool_name"):
        value = record.get(key)
        if isinstance(value, str) and _is_non_x_identifier(value):
            raise EvidenceError("SOURCE_UNAVAILABLE", f"non-X source route is forbidden: {key}")
    for key in ("network_required", "credential_required", "provider_call", "network_call"):
        if record.get(key) is True:
            raise EvidenceError("CAPABILITY_PROFILE_UNSATISFIED", f"{key} is not admitted")
    if record.get("kind") not in (None, "fixture"):
        raise EvidenceError("SOURCE_UNAVAILABLE", "only fixture source records are admitted")
def _record_id(record: Mapping[str, Any]) -> str:
    for key in ("evidence_id", "record_id", "source_record_id", "id"):
        if key in record:
            return _id(record[key], f"record.{key}")
    raise EvidenceError("INVALID_INPUT", "record has no stable identifier")
def _source_group(record: Mapping[str, Any]) -> str:
    value = record.get("source_group")
    return _id(value, "record.source_group")
def _locator(record: Mapping[str, Any]) -> str:
    value = record.get("canonical_locator", record.get("locator"))
    if not isinstance(value, str) or URI_RE.fullmatch(value) is None:
        raise EvidenceError("CITATION_INVALID", "record canonical locator is invalid")
    return value
def _observed_at(record: Mapping[str, Any]) -> str:
    value = record.get("observed_at")
    if not isinstance(value, str) or DATETIME_RE.fullmatch(value) is None:
        raise EvidenceError("INVALID_INPUT", "record observed_at is invalid")
    return value
def _claim_state(record: Mapping[str, Any]) -> str:
    value = record.get("claim_state", "OBSERVED")
    if value not in {"OBSERVED", "INFERRED", "UNAVAILABLE"}:
        raise EvidenceError("INVALID_INPUT", "claim_state is not closed")
    return value
def _permission(record: Mapping[str, Any]) -> str:
    value = record.get("permission_class", "local_fixture")
    if value not in {"local_fixture", "licensed_read", "public_read"}:
        raise EvidenceError("CAPABILITY_PROFILE_UNSATISFIED", "permission class is not admitted")
    return value
def _raw_content(record: Mapping[str, Any]) -> Any:
    for key in ("content", "source_content", "body", "raw_source"):
        if key in record:
            return record[key]
    if "summary" in record:
        return record["summary"]
    raise EvidenceError("SOURCE_UNAVAILABLE", "source record has no observable content")
def _summary(record: Mapping[str, Any], safe: Mapping[str, Any]) -> str:
    value = record.get("summary", safe.get("summary"))
    if value is None:
        value = record.get("content")
    if not isinstance(value, str):
        raise EvidenceError("REDACTION_REQUIRED", "summary is not bounded text")
    if len(value) > MAX_SUMMARY_CHARS:
        raise EvidenceError("REDACTION_REQUIRED", "summary exceeds the bounded receipt limit")
    try:
        result = redact_text(value, max_chars=MAX_SUMMARY_CHARS)
    except RedactionError as exc:
        raise EvidenceError(exc.code, str(exc)) from exc
    assert_safe(result)
    return result
def _source_receipt_hash(record: Mapping[str, Any], content_hash: str, locator: str) -> str:
    explicit = record.get("source_receipt_hash")
    if explicit is not None:
        return _sha(explicit, "record.source_receipt_hash")
    return sha256_json({
        "canonical_locator": locator,
        "content_hash": content_hash,
        "record_id": _record_id(record),
        "source_group": _source_group(record),
    })
def _source_receipt_ref(record: Mapping[str, Any]) -> str:
    value = record.get("source_receipt_ref", record.get("receipt_ref"))
    if value is None:
        value = f"receipt://fixture/{_record_id(record)}"
    return _text(value, "record.source_receipt_ref", maximum=1024)
def _locator_fragment(record: Mapping[str, Any], safe: Mapping[str, Any]) -> str:
    value = record.get("locator_fragment", safe.get("locator_fragment", "fixture observation"))
    return redact_text(_text(value, "record.locator_fragment", maximum=512), max_chars=512)
def field_provenance(
    record: Mapping[str, Any],
    *,
    source_receipt_ref: str | None = None,
    locator_fragment: str | None = None,
) -> dict[str, dict[str, Any]]:
    value = _mapping(record, "record")
    receipt_ref = source_receipt_ref or str(value.get("source_receipt_ref", value.get("receipt_ref", "unavailable")))
    fragment = locator_fragment or str(value.get("locator_fragment", "fixture observation"))
    state = _claim_state(value)
    fields = (
        "canonical_locator", "claim_state", "content_hash", "freshness_status",
        "observed_at", "permission_class", "query_hash", "source_capability_id",
        "source_group", "source_receipt_hash", "summary",
    )
    result: dict[str, dict[str, Any]] = {}
    observed_derivations = {
        "canonical_locator": "canonical_locator" in value or "locator" in value,
        "claim_state": True,
        "content_hash": "content_hash" in value or any(key in value for key in ("content", "source_content", "body", "raw_source")),
        "freshness_status": True,
        "observed_at": "observed_at" in value,
        "permission_class": "permission_class" in value,
        "query_hash": "query_hash" in value or "query" in value,
        "source_capability_id": "source_capability_id" in value,
        "source_group": "source_group" in value,
        "source_receipt_hash": "source_receipt_hash" in value or "source_receipt_ref" in value or "receipt_ref" in value,
        "summary": "summary" in value or any(key in value for key in ("content", "source_content", "body", "raw_source")),
    }
    for field in fields:
        if observed_derivations[field]:
            result[field] = {
                "state": state,
                "provenance": {
                    "source_receipt_ref": receipt_ref,
                    "locator_fragment": fragment,
                },
                "value": value.get(field),
            }
        else:
            result[field] = {
                "state": "UNAVAILABLE",
                "provenance": {
                    "source_receipt_ref": receipt_ref,
                    "locator_fragment": fragment,
                },
                "value": None,
            }
    return result
def build_evidence_receipt(
    record: Mapping[str, Any],
    *,
    requested_model: str = MODEL,
    requested_reasoning: str = REASONING,
    actual_identity: str = ACTUAL_IDENTITY,
) -> dict[str, Any]:
    value = _mapping(record, "record"); _require_non_x(value)
    if requested_model != MODEL or requested_reasoning != REASONING:
        raise EvidenceError("INVALID_INPUT", "requested selector is not Luna/max")
    if actual_identity != ACTUAL_IDENTITY:
        raise EvidenceError("INVALID_INPUT", "actual identity requires host attestation")
    record_id = _record_id(value)
    group = _source_group(value)
    locator = _locator(value)
    observed_at = _observed_at(value)
    permission = _permission(value)
    state = _claim_state(value)
    content_hash = _sha(value.get("content_hash", canonical_content_hash(_raw_content(value))), "record.content_hash")
    query_hash = _sha(value.get("query_hash", canonical_query_hash(value.get("query", ""))), "record.query_hash")
    safe = redact_source_record(value); summary = _summary(value, safe)
    receipt_hash = _source_receipt_hash(value, content_hash, locator)
    receipt_ref = _source_receipt_ref(value)
    evidence: dict[str, Any] = {
        "actual_identity": ACTUAL_IDENTITY,
        "authority": copy.deepcopy(AUTHORITY),
        "canonical_locator": locator,
        "claim_state": state,
        "collector_attempt_count": 0,
        "content_hash": content_hash,
        "credential_material_present": False,
        "evidence_id": record_id,
        "evidence_sha256": ZERO_SHA256,
        "freshness_status": value.get("freshness_status", "current"),
        "observed_at": observed_at,
        "permission_class": permission,
        "plugin_output_authority": "evidence_only",
        "private_content_included": False,
        "query_hash": query_hash,
        "raw_source_included": False,
        "redaction_status": safe.get("_redaction_status", "not_required"),
        "requested_model": MODEL,
        "requested_reasoning": REASONING,
        "schema": EVIDENCE_SCHEMA,
        "source_capability_id": _id(value.get("source_capability_id"), "record.source_capability_id"),
        "source_group": group,
        "source_receipt_hash": receipt_hash,
        "source_receipt_ref": receipt_ref,
        "summary": summary,
    }
    if evidence["freshness_status"] not in {"current", "not_applicable", "stale", "unknown"}:
        raise EvidenceError("INVALID_INPUT", "freshness_status is not closed")
    evidence = _bind(evidence, "evidence_sha256")
    validate_evidence_receipt(evidence)
    return evidence
def build_citation(
    evidence: Mapping[str, Any],
    locator_fragment: str,
    *,
    claim_state: str | None = None,
    citation_id: str | None = None,
) -> dict[str, Any]:
    value = validate_evidence_receipt(evidence)
    fragment = redact_text(_text(locator_fragment, "locator_fragment", maximum=512), max_chars=512)
    state = claim_state or value["claim_state"]
    if state != value["claim_state"] or state not in {"OBSERVED", "INFERRED", "UNAVAILABLE"}:
        raise EvidenceError("CITATION_INVALID", "citation state does not match evidence")
    cid = citation_id or f"{value['evidence_id']}:citation:{sha256_bytes(fragment.encode('utf-8'))[:16]}"
    _id(cid, "citation_id")
    citation: dict[str, Any] = {
        "actual_identity": ACTUAL_IDENTITY,
        "authority": copy.deepcopy(AUTHORITY),
        "canonical_locator": value["canonical_locator"],
        "citation_id": cid,
        "citation_sha256": ZERO_SHA256,
        "claim_state": state,
        "evidence_id": value["evidence_id"],
        "locator_fragment": fragment,
        "observed_at": value["observed_at"],
        "requested_model": MODEL,
        "requested_reasoning": REASONING,
        "schema": CITATION_SCHEMA,
        "source_group": value["source_group"],
        "source_receipt_hash": value["source_receipt_hash"],
    }
    citation = _bind(citation, "citation_sha256")
    validate_citation(citation, value)
    return citation
def validate_evidence_receipt(evidence: Mapping[str, Any]) -> dict[str, Any]:
    value = _mapping(evidence, "evidence")
    required = {
        "actual_identity", "authority", "canonical_locator", "claim_state",
        "collector_attempt_count", "content_hash", "credential_material_present",
        "evidence_id", "evidence_sha256", "freshness_status", "observed_at",
        "permission_class", "plugin_output_authority", "private_content_included",
        "query_hash", "raw_source_included", "redaction_status", "requested_model",
        "requested_reasoning", "schema", "source_capability_id", "source_group",
        "source_receipt_hash", "source_receipt_ref", "summary",
    }
    if set(value) != required:
        raise EvidenceError("UNKNOWN_FIELD", "evidence receipt is not closed")
    if value["schema"] != EVIDENCE_SCHEMA or value["actual_identity"] != ACTUAL_IDENTITY:
        raise EvidenceError("INVALID_INPUT", "evidence schema or identity drift")
    if value["authority"] != AUTHORITY or value["plugin_output_authority"] != "evidence_only":
        raise EvidenceError("INVALID_INPUT", "evidence authority drift")
    for field in ("evidence_id", "source_capability_id", "source_group"):
        _id(value[field], f"evidence.{field}")
    for field in ("content_hash", "query_hash", "source_receipt_hash", "evidence_sha256"):
        _sha(value[field], f"evidence.{field}")
    if URI_RE.fullmatch(value["canonical_locator"]) is None:
        raise EvidenceError("CITATION_INVALID", "evidence locator is invalid")
    if not DATETIME_RE.fullmatch(value["observed_at"]):
        raise EvidenceError("INVALID_INPUT", "evidence timestamp is invalid")
    if value["claim_state"] not in {"OBSERVED", "INFERRED", "UNAVAILABLE"}:
        raise EvidenceError("INVALID_INPUT", "evidence claim state is not closed")
    if value["permission_class"] not in {"licensed_read", "local_fixture", "public_read"}:
        raise EvidenceError("CAPABILITY_PROFILE_UNSATISFIED", "evidence permission class is not admitted")
    if value["collector_attempt_count"] != 0:
        raise EvidenceError("BUDGET_OVERSHOOT", "fixture collector attempt count is not zero")
    if value["credential_material_present"] or value["private_content_included"] or value["raw_source_included"]:
        raise EvidenceError("REDACTION_REQUIRED", "evidence contains prohibited material")
    if value["requested_model"] != MODEL or value["requested_reasoning"] != REASONING:
        raise EvidenceError("INVALID_INPUT", "evidence selector drift")
    _text(value["source_receipt_ref"], "evidence.source_receipt_ref", maximum=1024); _text(value["summary"], "evidence.summary", maximum=2048)
    if contains_sensitive_material(value):
        raise EvidenceError("REDACTION_REQUIRED", "evidence contains sensitive material")
    _verify_binding(value, "evidence_sha256", "evidence")
    return value
def validate_citation(
    citation: Mapping[str, Any],
    evidence: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    value = _mapping(citation, "citation")
    required = {
        "actual_identity", "authority", "canonical_locator", "citation_id",
        "citation_sha256", "claim_state", "evidence_id", "locator_fragment",
        "observed_at", "requested_model", "requested_reasoning", "schema",
        "source_group", "source_receipt_hash",
    }
    if set(value) != required:
        raise EvidenceError("UNKNOWN_FIELD", "citation is not closed")
    if value["schema"] != CITATION_SCHEMA or value["actual_identity"] != ACTUAL_IDENTITY:
        raise EvidenceError("CITATION_INVALID", "citation schema or identity drift")
    if value["authority"] != AUTHORITY:
        raise EvidenceError("CITATION_INVALID", "citation authority drift")
    _id(value["citation_id"], "citation.citation_id")
    _id(value["evidence_id"], "citation.evidence_id")
    _id(value["source_group"], "citation.source_group")
    _sha(value["citation_sha256"], "citation.citation_sha256")
    _sha(value["source_receipt_hash"], "citation.source_receipt_hash")
    if URI_RE.fullmatch(value["canonical_locator"]) is None or not DATETIME_RE.fullmatch(value["observed_at"]):
        raise EvidenceError("CITATION_INVALID", "citation locator or timestamp is invalid")
    if value["claim_state"] not in {"OBSERVED", "INFERRED", "UNAVAILABLE"}:
        raise EvidenceError("CITATION_INVALID", "citation state is not closed")
    _text(value["locator_fragment"], "citation.locator_fragment", maximum=512)
    if contains_sensitive_material(value):
        raise EvidenceError("REDACTION_REQUIRED", "citation contains sensitive material")
    if evidence is not None:
        bound = validate_evidence_receipt(evidence)
        for field in ("evidence_id", "canonical_locator", "observed_at", "source_group", "source_receipt_hash", "claim_state"):
            if value[field] != bound[field]:
                raise EvidenceError("CITATION_INVALID", f"citation does not bind evidence.{field}")
    _verify_binding(value, "citation_sha256", "citation")
    return value
def make_abstention(
    *,
    code: str,
    stage: str,
    reason: str,
    bead_id: str = "bead:r3:evidence",
    decision_id: str = "decision:r3:evidence",
    set_id: str = "set:r3:evidence",
    plugin_id: str = "corvus.researcher.platform_neutral",
    evidence_refs: Sequence[str] = (),
    source_capability_status: str = "SOURCE_UNAVAILABLE",
) -> dict[str, Any]:
    allowed_codes = {
        "ATTEMPT_TELEMETRY_UNAVAILABLE", "AUTH_CUSTODY_UNPROVEN", "BUDGET_OVERSHOOT",
        "CAPABILITY_PROFILE_UNSATISFIED", "CANCELLED", "CITATION_INVALID",
        "CORROBORATION_INSUFFICIENT", "DEADLINE_EXCEEDED", "INVALID_INPUT",
        "REDACTION_REQUIRED", "SOURCE_UNAVAILABLE", "TERMINAL_UNKNOWN", "UNKNOWN_FIELD",
    }
    stages = {"admission", "budget", "cancellation", "citation", "deadline", "input", "redaction", "source", "terminal"}
    if code not in allowed_codes or stage not in stages:
        raise EvidenceError("INVALID_INPUT", "abstention code or stage is not closed")
    if source_capability_status not in {"NOT_ADMITTED__CAPABILITY_UNPROVEN", "NOT_APPLICABLE", "SOURCE_UNAVAILABLE"}:
        raise EvidenceError("INVALID_INPUT", "abstention capability status is not closed")
    safe_reason = redact_text(_text(reason, "reason", maximum=1024), max_chars=1024)
    refs = sorted(set(_id(ref, "evidence_ref") for ref in evidence_refs))
    value: dict[str, Any] = {
        "abstention_id": f"abstention:{sha256_bytes(f'{code}:{stage}:{safe_reason}'.encode('utf-8'))[:24]}",
        "abstention_sha256": ZERO_SHA256,
        "actual_identity": ACTUAL_IDENTITY,
        "authority": copy.deepcopy(AUTHORITY),
        "bead_id": _id(bead_id, "bead_id"),
        "code": code,
        "decision_id": _id(decision_id, "decision_id"),
        "evidence_refs": refs,
        "execution_allowed": False,
        "plugin_id": _id(plugin_id, "plugin_id"),
        "reason": safe_reason,
        "requested_model": MODEL,
        "requested_reasoning": REASONING,
        "retry_budget": 0,
        "schema": ABSTENTION_SCHEMA,
        "set_id": _id(set_id, "set_id"),
        "source_capability_status": source_capability_status,
        "stage": stage,
    }
    return _bind(value, "abstention_sha256")
class FixtureSourceAdapter:
    def __init__(self, records: Iterable[Mapping[str, Any]], *, capability_id: str = "fixture.local", source_group: str = "fixture_local") -> None:
        self.capability_id = _id(capability_id, "capability_id"); self.source_group = _id(source_group, "source_group")
        if _is_non_x_identifier(self.capability_id) or _is_non_x_identifier(self.source_group):
            raise EvidenceError("SOURCE_UNAVAILABLE", "fixture adapter cannot use a prohibited route")
        self._records = tuple(copy.deepcopy(_mapping(record, "record")) for record in records)
        for record in self._records:
            _require_non_x(record)
            if record.get("kind") not in (None, "fixture"):
                raise EvidenceError("SOURCE_UNAVAILABLE", "adapter accepts fixture records only")
    def read(self, query: str | None = None) -> list[dict[str, Any]]:
        if query is not None:
            _text(query, "query", maximum=4096)
        return [normalize_source_record(record, requested_query=query) for record in self._records]
    collect = read
    fetch = read
    execute = read
def normalize_source_record(
    record: Mapping[str, Any],
    *,
    requested_query: str | None = None,
    requested_model: str = MODEL,
    requested_reasoning: str = REASONING,
) -> dict[str, Any]:
    value = _mapping(record, "record")
    if requested_query is not None:
        value["query"] = requested_query
    evidence = build_evidence_receipt(
        value,
        requested_model=requested_model,
        requested_reasoning=requested_reasoning,
    )
    safe = redact_source_record(value); citation = build_citation(evidence, _locator_fragment(value, safe))
    return {
        "evidence": evidence,
        "citation": citation,
        "provenance": field_provenance(
            value,
            source_receipt_ref=evidence["source_receipt_ref"],
            locator_fragment=citation["locator_fragment"],
        ),
        "redacted_record": safe,
        "content_hash": evidence["content_hash"],
        "source_group": evidence["source_group"],
        "canonical_identity": (evidence["canonical_locator"], evidence["content_hash"]),
    }
normalize_record = normalize_source_record
make_evidence_receipt = build_evidence_receipt
make_citation = build_citation
validate_evidence = validate_evidence_receipt
__all__ = [
    "ABSTENTION_SCHEMA",
    "ACTUAL_IDENTITY",
    "AUTHORITY",
    "CANONICAL_ENCODING",
    "CITATION_SCHEMA",
    "EVIDENCE_SCHEMA",
    "EvidenceError",
    "FixtureSourceAdapter",
    "MODEL",
    "REASONING",
    "ZERO_SHA256",
    "build_citation",
    "build_evidence_receipt",
    "canonical_content_hash",
    "canonical_query_hash",
    "field_provenance",
    "make_abstention",
    "make_citation",
    "make_evidence_receipt",
    "normalize_record",
    "normalize_source_record",
    "validate_citation",
    "validate_evidence",
    "validate_evidence_receipt",
]
