#!/usr/bin/env python3
"""Advisory proposal and typed abstention builders for R3."""
from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

try:
    from .evidence import AUTHORITY, MODEL, REASONING, EvidenceError, validate_citation, validate_evidence, sha256_json
except ImportError:
    from evidence import AUTHORITY, MODEL, REASONING, EvidenceError, validate_citation, validate_evidence, sha256_json


ZERO_SHA256 = "0" * 64
_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_SHA_RE = re.compile(r"^[0-9a-f]{64}$")
ABSTENTION_CODES = frozenset(
    {
        "ATTEMPT_TELEMETRY_UNAVAILABLE", "AUTH_CUSTODY_UNPROVEN", "BUDGET_OVERSHOOT",
        "CAPABILITY_PROFILE_UNSATISFIED", "CANCELLED", "CITATION_INVALID",
        "CORROBORATION_INSUFFICIENT", "DEADLINE_EXCEEDED", "INVALID_INPUT",
        "REDACTION_REQUIRED", "SOURCE_UNAVAILABLE", "TERMINAL_UNKNOWN", "UNKNOWN_FIELD",
    }
)
ABSTENTION_STAGES = frozenset({"admission", "budget", "cancellation", "citation", "deadline", "input", "redaction", "source", "terminal"})
PROPOSAL_KEYS = frozenset(
    {
        "actual_identity", "authority", "bead_id", "decision_id", "evidence_refs", "execution_allowed",
        "inferred_claims", "observed_claims", "proposal_id", "proposal_sha256", "recommended_next_steps",
        "requested_model", "requested_reasoning", "risks", "schema", "set_id", "unavailable_gaps",
    }
)
ABSTENTION_KEYS = frozenset(
    {
        "abstention_id", "abstention_sha256", "actual_identity", "authority", "bead_id", "code",
        "decision_id", "evidence_refs", "execution_allowed", "plugin_id", "reason", "requested_model",
        "requested_reasoning", "retry_budget", "schema", "set_id", "source_capability_status", "stage",
    }
)


class ProposalError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(f"{code}: {message}")


def _id(value: Any, name: str) -> str:
    if not isinstance(value, str) or _ID_RE.fullmatch(value) is None:
        raise ProposalError("INVALID_INPUT", f"{name} is not an identifier")
    return value


def _sha(value: Any, name: str) -> str:
    if not isinstance(value, str) or _SHA_RE.fullmatch(value) is None:
        raise ProposalError("INVALID_INPUT", f"{name} is not SHA-256")
    return value


def _without(value: Mapping[str, Any], key: str) -> dict[str, Any]:
    result = dict(value); result.pop(key, None); return result


def _refs(refs: Sequence[str]) -> list[str]:
    if not isinstance(refs, Sequence) or isinstance(refs, (str, bytes, bytearray)):
        raise ProposalError("INVALID_INPUT", "evidence_refs must be an array")
    values = [_id(ref, "evidence_ref") for ref in refs]
    if len(values) != len(set(values)) or len(values) > 32:
        raise ProposalError("INVALID_INPUT", "evidence_refs are not unique and bounded")
    return values


def validate_abstention(value: Mapping[str, Any]) -> bool:
    if not isinstance(value, Mapping) or set(value) != set(ABSTENTION_KEYS):
        raise ProposalError("UNKNOWN_FIELD" if isinstance(value, Mapping) and set(value) - set(ABSTENTION_KEYS) else "INVALID_INPUT", "abstention fields are not closed")
    item = dict(value)
    if item["schema"] != "researcher.abstention.v1" or item["actual_identity"] != "unreported" or item["requested_model"] != MODEL or item["requested_reasoning"] != REASONING:
        raise ProposalError("INVALID_INPUT", "abstention identity drift")
    if item["authority"] != AUTHORITY or item["execution_allowed"] is not False or item["retry_budget"] != 0:
        raise ProposalError("CAPABILITY_PROFILE_UNSATISFIED", "abstention authority or retry drift")
    for key in ("abstention_id", "bead_id", "decision_id", "plugin_id", "set_id"):
        _id(item[key], key)
    _sha(item["abstention_sha256"], "abstention_sha256")
    _refs(item["evidence_refs"])
    if item["code"] not in ABSTENTION_CODES or item["stage"] not in ABSTENTION_STAGES:
        raise ProposalError("INVALID_INPUT", "abstention code or stage is not closed")
    if item["source_capability_status"] not in {"NOT_ADMITTED__CAPABILITY_UNPROVEN", "NOT_APPLICABLE", "SOURCE_UNAVAILABLE"}:
        raise ProposalError("INVALID_INPUT", "source capability status is not closed")
    if not isinstance(item["reason"], str) or not item["reason"] or len(item["reason"]) > 1024:
        raise ProposalError("INVALID_INPUT", "abstention reason is not bounded")
    if item["abstention_sha256"] != sha256_json(_without(item, "abstention_sha256")):
        raise ProposalError("HASH_MISMATCH", "abstention hash mismatch")
    return True


def make_abstention(
    *,
    bead_id: str,
    set_id: str,
    decision_id: str,
    plugin_id: str,
    code: str,
    stage: str,
    reason: str,
    source_capability_status: str = "SOURCE_UNAVAILABLE",
    evidence_refs: Sequence[str] = (),
    abstention_id: str = "abstention-r3",
) -> dict[str, Any]:
    item = {
        "abstention_id": _id(abstention_id, "abstention_id"), "abstention_sha256": ZERO_SHA256,
        "actual_identity": "unreported", "authority": dict(AUTHORITY), "bead_id": _id(bead_id, "bead_id"),
        "code": code, "decision_id": _id(decision_id, "decision_id"), "evidence_refs": _refs(evidence_refs),
        "execution_allowed": False, "plugin_id": _id(plugin_id, "plugin_id"), "reason": reason,
        "requested_model": MODEL, "requested_reasoning": REASONING, "retry_budget": 0,
        "schema": "researcher.abstention.v1", "set_id": _id(set_id, "set_id"),
        "source_capability_status": source_capability_status, "stage": stage,
    }
    item["abstention_sha256"] = sha256_json(_without(item, "abstention_sha256"))
    validate_abstention(item)
    return item


def _claim_refs(claims: Sequence[Mapping[str, Any]], known: set[str], kind: str) -> list[dict[str, Any]]:
    if not isinstance(claims, Sequence) or isinstance(claims, (str, bytes, bytearray)):
        raise ProposalError("INVALID_INPUT", f"{kind}_claims must be an array")
    result = []
    seen: set[str] = set()
    for claim in claims:
        if not isinstance(claim, Mapping):
            raise ProposalError("INVALID_INPUT", f"{kind} claim is not an object")
        expected = {"claim_id", "evidence_refs", "state", "statement"} | ({"inference_rule"} if kind == "inferred" else set())
        if set(claim) != expected:
            raise ProposalError("UNKNOWN_FIELD" if set(claim) - expected else "INVALID_INPUT", f"{kind} claim fields are not closed")
        value = dict(claim); claim_id = _id(value["claim_id"], "claim_id")
        if claim_id in seen or not isinstance(value["statement"], str) or not value["statement"] or len(value["statement"]) > 1024:
            raise ProposalError("INVALID_INPUT", f"{kind} claim is not bounded or unique")
        refs = _refs(value["evidence_refs"])
        if not refs or any(ref not in known for ref in refs) or value["state"] != ("INFERRED" if kind == "inferred" else "OBSERVED"):
            raise ProposalError("CITATION_INVALID", f"{kind} claim references invalid evidence")
        if kind == "inferred": _id(value["inference_rule"], "inference_rule")
        seen.add(claim_id); result.append(value)
    return result


def validate_proposal(value: Mapping[str, Any]) -> bool:
    if not isinstance(value, Mapping) or set(value) != set(PROPOSAL_KEYS):
        raise ProposalError("UNKNOWN_FIELD" if isinstance(value, Mapping) and set(value) - set(PROPOSAL_KEYS) else "INVALID_INPUT", "proposal fields are not closed")
    item = dict(value)
    if item["schema"] != "researcher.proposal.v1" or item["actual_identity"] != "unreported" or item["requested_model"] != MODEL or item["requested_reasoning"] != REASONING:
        raise ProposalError("INVALID_INPUT", "proposal identity drift")
    if item["authority"] != AUTHORITY or item["execution_allowed"] is not False:
        raise ProposalError("CAPABILITY_PROFILE_UNSATISFIED", "proposal authority drift")
    for key in ("bead_id", "decision_id", "proposal_id", "set_id"):
        _id(item[key], key)
    _sha(item["proposal_sha256"], "proposal_sha256"); _refs(item["evidence_refs"])
    if item["proposal_sha256"] != sha256_json(_without(item, "proposal_sha256")):
        raise ProposalError("HASH_MISMATCH", "proposal hash mismatch")
    return True


def make_proposal(
    evidence: Sequence[Mapping[str, Any]],
    citations: Sequence[Mapping[str, Any]],
    *,
    bead_id: str,
    set_id: str,
    decision_id: str,
    proposal_id: str = "proposal-r3",
    observed_claims: Sequence[Mapping[str, Any]] | None = None,
    inferred_claims: Sequence[Mapping[str, Any]] = (),
    unavailable_gaps: Sequence[Mapping[str, Any]] = (),
    risks: Sequence[Mapping[str, Any]] = (),
    recommended_next_steps: Sequence[Mapping[str, Any]] = (),
) -> dict[str, Any]:
    if not isinstance(evidence, Sequence) or not isinstance(citations, Sequence):
        raise ProposalError("INVALID_INPUT", "evidence and citations must be arrays")
    evidence_items = [dict(item) for item in evidence]
    for item in evidence_items: validate_evidence(item)
    by_id = {item["evidence_id"]: item for item in evidence_items}
    if len(by_id) != len(evidence_items): raise ProposalError("INVALID_INPUT", "evidence IDs are not unique")
    citation_items = [dict(item) for item in citations]
    for item in citation_items:
        evidence_item = by_id.get(item.get("evidence_id"))
        if evidence_item is None: raise ProposalError("CITATION_INVALID", "citation references unknown evidence")
        validate_citation(item, evidence_item)
    citation_ids = {item["evidence_id"] for item in citation_items}
    refs = [item["evidence_id"] for item in evidence_items]
    observed = list(observed_claims) if observed_claims is not None else [
        {"claim_id": "claim-" + item["evidence_id"], "evidence_refs": [item["evidence_id"]], "state": "OBSERVED", "statement": item["summary"]}
        for item in evidence_items if item["claim_state"] == "OBSERVED"
    ]
    observed_values = _claim_refs(observed, set(by_id), "observed")
    inferred_values = _claim_refs(inferred_claims, set(by_id), "inferred")
    for claim in observed_values + inferred_values:
        if any(ref not in citation_ids for ref in claim["evidence_refs"]):
            raise ProposalError("CITATION_INVALID", "claim lacks a bound citation")
    item = {
        "actual_identity": "unreported", "authority": dict(AUTHORITY), "bead_id": _id(bead_id, "bead_id"),
        "decision_id": _id(decision_id, "decision_id"), "evidence_refs": _refs(refs), "execution_allowed": False,
        "inferred_claims": inferred_values, "observed_claims": observed_values, "proposal_id": _id(proposal_id, "proposal_id"),
        "proposal_sha256": ZERO_SHA256, "recommended_next_steps": list(recommended_next_steps), "requested_model": MODEL,
        "requested_reasoning": REASONING, "risks": list(risks), "schema": "researcher.proposal.v1", "set_id": _id(set_id, "set_id"),
        "unavailable_gaps": list(unavailable_gaps),
    }
    item["proposal_sha256"] = sha256_json(_without(item, "proposal_sha256"))
    validate_proposal(item)
    return item


build_proposal = make_proposal
build_abstention = make_abstention

