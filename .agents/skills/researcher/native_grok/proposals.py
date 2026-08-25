#!/usr/bin/env python3
"""R3 claims, typed abstentions, deterministic proposals, and terminals."""
from __future__ import annotations

import copy
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

try:
    from .compiler import canonical_bytes, sha256_json
    from .corroboration import deduplicate_evidence, require_independent_sources
    from .evidence import (
        ACTUAL_IDENTITY,
        AUTHORITY,
        CANONICAL_ENCODING,
        MODEL,
        REASONING,
        ZERO_SHA256,
        EvidenceError,
        build_citation,
        make_abstention,
        validate_citation,
        validate_evidence_receipt,
    )
except ImportError:  # pragma: no cover - direct focused-test import
    from compiler import canonical_bytes, sha256_json
    from corroboration import deduplicate_evidence, require_independent_sources
    from evidence import (
        ACTUAL_IDENTITY,
        AUTHORITY,
        CANONICAL_ENCODING,
        MODEL,
        REASONING,
        ZERO_SHA256,
        EvidenceError,
        build_citation,
        make_abstention,
        validate_citation,
        validate_evidence_receipt,
    )

PROPOSAL_SCHEMA = "researcher.proposal.v1"
TERMINAL_SCHEMA = "researcher.terminal.v1"
ALLOWED_GAP_CODES = {
    "ATTEMPT_TELEMETRY_UNAVAILABLE", "AUTH_CUSTODY_UNPROVEN", "BUDGET_OVERSHOOT",
    "CAPABILITY_PROFILE_UNSATISFIED", "CANCELLED", "CITATION_INVALID",
    "CORROBORATION_INSUFFICIENT", "DEADLINE_EXCEEDED", "INVALID_INPUT",
    "REDACTION_REQUIRED", "SOURCE_UNAVAILABLE", "TERMINAL_UNKNOWN", "UNKNOWN_FIELD",
}
SCOPE_COUNTER_KEYS = (
    "configuration_mutations", "credential_reads", "deployment_effects", "descendants",
    "forge_effects", "git_publication", "install_effects", "network_calls",
    "out_of_scope_writes", "peer_messages", "production_effects", "protected_effects",
    "provider_calls", "retries", "restart_effects", "tool_calls", "waits",
)


def _id(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value or len(value) > 128 or any(ch in "\x00\n\r\t" for ch in value):
        raise EvidenceError("INVALID_INPUT", f"{name} is not bounded")
    return value


def _text(value: Any, name: str, maximum: int = 1024) -> str:
    if not isinstance(value, str) or not value or len(value) > maximum or any(ord(ch) < 32 or ord(ch) == 127 for ch in value):
        raise EvidenceError("INVALID_INPUT", f"{name} is not bounded text")
    return value


def _bound(value: Mapping[str, Any], field: str) -> dict[str, Any]:
    result = dict(value)
    body = dict(result)
    body.pop(field, None)
    result[field] = sha256_json(body)
    return result


def _verify_hash(value: Mapping[str, Any], field: str) -> None:
    expected = sha256_json({key: item for key, item in value.items() if key != field})
    if value.get(field) != expected:
        raise EvidenceError("HASH_MISMATCH", f"{field} is not bound")


def _refs(items: Iterable[str]) -> list[str]:
    return sorted(set(_id(item, "evidence_ref") for item in items))


def _claim(
    claim: Mapping[str, Any],
    *,
    state: str,
    inferred: bool,
) -> dict[str, Any]:
    value = dict(claim)
    expected = {"claim_id", "evidence_refs", "state", "statement"}
    if inferred:
        expected.add("inference_rule")
    if set(value) != expected:
        raise EvidenceError("UNKNOWN_FIELD", "claim is not closed")
    if value["state"] != state:
        raise EvidenceError("INVALID_INPUT", "claim state drift")
    value["claim_id"] = _id(value["claim_id"], "claim_id")
    value["evidence_refs"] = _refs(value["evidence_refs"])
    if not value["evidence_refs"]:
        raise EvidenceError("CITATION_INVALID", "claim has no evidence references")
    value["statement"] = _text(value["statement"], "claim.statement")
    if inferred:
        value["inference_rule"] = _id(value["inference_rule"], "inference_rule")
    return value


def build_proposal(
    *,
    bead_id: str,
    decision_id: str,
    set_id: str,
    evidence: Iterable[Mapping[str, Any]],
    citations: Iterable[Mapping[str, Any]] | None = None,
    observed_claims: Iterable[Mapping[str, Any]] = (),
    inferred_claims: Iterable[Mapping[str, Any]] = (),
    unavailable_gaps: Iterable[Mapping[str, Any]] = (),
    risks: Iterable[Mapping[str, Any]] = (),
    recommended_next_steps: Iterable[Mapping[str, Any]] = (),
    proposal_id: str = "proposal:r3:evidence",
    require_corroboration: bool = False,
    minimum_source_groups: int = 2,
) -> dict[str, Any]:
    """Build an advisory proposal; it can never authorize execution."""
    values = [validate_evidence_receipt(item) for item in evidence]
    deduped = deduplicate_evidence(values)
    evidence_by_id = {item["evidence_id"]: item for item in deduped}
    if require_corroboration:
        require_independent_sources(deduped, minimum_source_groups=minimum_source_groups)
    citation_values = list(citations or ())
    citations_by_id: dict[str, dict[str, Any]] = {}
    for citation in citation_values:
        bound = validate_citation(citation)
        if bound["evidence_id"] not in evidence_by_id:
            raise EvidenceError("CITATION_INVALID", "citation references unknown evidence")
        validate_citation(bound, evidence_by_id[bound["evidence_id"]])
        citations_by_id[bound["evidence_id"]] = bound
    if not citation_values:
        for item in deduped:
            citations_by_id[item["evidence_id"]] = build_citation(item, "fixture observation")
    observed = [_claim(item, state="OBSERVED", inferred=False) for item in observed_claims]
    inferred = [_claim(item, state="INFERRED", inferred=True) for item in inferred_claims]
    known_refs = set(evidence_by_id)
    for claim in observed + inferred:
        if not set(claim["evidence_refs"]).issubset(known_refs):
            raise EvidenceError("CITATION_INVALID", "claim references unknown evidence")
        for ref in claim["evidence_refs"]:
            if ref not in citations_by_id:
                raise EvidenceError("CITATION_INVALID", "claim has no bound citation")
    gaps: list[dict[str, Any]] = []
    for raw in unavailable_gaps:
        gap = dict(raw)
        if set(gap) != {"code", "description", "gap_id"}:
            raise EvidenceError("UNKNOWN_FIELD", "unavailable gap is not closed")
        if gap["code"] not in ALLOWED_GAP_CODES:
            raise EvidenceError("INVALID_INPUT", "unavailable gap code is not closed")
        gaps.append({
            "code": gap["code"],
            "description": _text(gap["description"], "gap.description"),
            "gap_id": _id(gap["gap_id"], "gap_id"),
        })
    risk_values: list[dict[str, Any]] = []
    for raw in risks:
        risk = dict(raw)
        if set(risk) != {"description", "risk_id", "severity"} or risk["severity"] not in {"high", "medium", "low"}:
            raise EvidenceError("INVALID_INPUT", "risk is not closed")
        risk_values.append({
            "description": _text(risk["description"], "risk.description"),
            "risk_id": _id(risk["risk_id"], "risk_id"),
            "severity": risk["severity"],
        })
    steps: list[dict[str, Any]] = []
    for raw in recommended_next_steps:
        step = dict(raw)
        if set(step) != {"action", "bounded_scope", "reversibility", "step_id"} or step["reversibility"] not in {"operator_gated", "reversible"}:
            raise EvidenceError("INVALID_INPUT", "next step is not closed")
        steps.append({
            "action": _text(step["action"], "step.action"),
            "bounded_scope": _text(step["bounded_scope"], "step.bounded_scope"),
            "reversibility": step["reversibility"],
            "step_id": _id(step["step_id"], "step_id"),
        })
    proposal: dict[str, Any] = {
        "actual_identity": ACTUAL_IDENTITY,
        "authority": copy.deepcopy(AUTHORITY),
        "bead_id": _id(bead_id, "bead_id"),
        "decision_id": _id(decision_id, "decision_id"),
        "evidence_refs": sorted(evidence_by_id),
        "execution_allowed": False,
        "inferred_claims": inferred,
        "observed_claims": observed,
        "proposal_id": _id(proposal_id, "proposal_id"),
        "proposal_sha256": ZERO_SHA256,
        "recommended_next_steps": steps,
        "requested_model": MODEL,
        "requested_reasoning": REASONING,
        "risks": risk_values,
        "schema": PROPOSAL_SCHEMA,
        "set_id": _id(set_id, "set_id"),
        "unavailable_gaps": gaps,
    }
    return validate_proposal(_bound(proposal, "proposal_sha256"))


def validate_proposal(proposal: Mapping[str, Any]) -> dict[str, Any]:
    value = dict(proposal)
    required = {
        "actual_identity", "authority", "bead_id", "decision_id", "evidence_refs",
        "execution_allowed", "inferred_claims", "observed_claims", "proposal_id",
        "proposal_sha256", "recommended_next_steps", "requested_model",
        "requested_reasoning", "risks", "schema", "set_id", "unavailable_gaps",
    }
    if set(value) != required:
        raise EvidenceError("UNKNOWN_FIELD", "proposal is not closed")
    if value["schema"] != PROPOSAL_SCHEMA or value["actual_identity"] != ACTUAL_IDENTITY:
        raise EvidenceError("INVALID_INPUT", "proposal schema or identity drift")
    if value["authority"] != AUTHORITY or value["execution_allowed"] is not False:
        raise EvidenceError("INVALID_INPUT", "proposal authority or execution drift")
    _verify_hash(value, "proposal_sha256")
    return value


def build_terminal(
    *,
    bead_id: str,
    decision_id: str,
    set_id: str,
    source_capability_status: str = "NOT_APPLICABLE",
    verdict: str = "ACCEPTED",
    defect: str = "none",
    evidence_refs: Sequence[str] = (),
    proposal_ref: str = "none",
    result_sha256: str = ZERO_SHA256,
    status_before_sha256: str = ZERO_SHA256,
    status_after_sha256: str = ZERO_SHA256,
    replay_pairs: int = 100,
    replay_mismatches: int = 0,
    tool_calls: int = 0,
) -> dict[str, Any]:
    """Create the closed R1 terminal ABI with deterministic replay binding."""
    if verdict not in {"ACCEPTED", "ABSTAINED", "REJECTED", "UNKNOWN"}:
        raise EvidenceError("INVALID_INPUT", "terminal verdict is not closed")
    if defect not in {"capability_unproven", "none", "schema_invalid", "scope_violation", "unknown_terminal"}:
        raise EvidenceError("INVALID_INPUT", "terminal defect is not closed")
    if source_capability_status not in {"ADMITTED", "NOT_ADMITTED__CAPABILITY_UNPROVEN", "NOT_APPLICABLE"}:
        raise EvidenceError("INVALID_INPUT", "terminal source status is not closed")
    for name, value in (("result_sha256", result_sha256), ("status_before_sha256", status_before_sha256), ("status_after_sha256", status_after_sha256)):
        if not isinstance(value, str) or len(value) != 64:
            raise EvidenceError("INVALID_INPUT", f"{name} is not SHA-256")
    if not isinstance(replay_pairs, int) or not 0 <= replay_pairs <= 100 or not isinstance(replay_mismatches, int) or not 0 <= replay_mismatches <= 100:
        raise EvidenceError("INVALID_INPUT", "replay metrics are outside bounds")
    counters = {key: 0 for key in SCOPE_COUNTER_KEYS}
    counters["tool_calls"] = tool_calls
    terminal: dict[str, Any] = {
        "actual_identity": ACTUAL_IDENTITY,
        "authority": copy.deepcopy(AUTHORITY),
        "bead_id": _id(bead_id, "bead_id"),
        "canonical_encoding": CANONICAL_ENCODING,
        "decision_id": _id(decision_id, "decision_id"),
        "defect": defect,
        "evidence_refs": _refs(evidence_refs),
        "proposal_ref": _id(proposal_ref, "proposal_ref"),
        "replay": {"mismatches": replay_mismatches, "pairs": replay_pairs},
        "requested_model": MODEL,
        "requested_reasoning": REASONING,
        "result_sha256": result_sha256,
        "schema": TERMINAL_SCHEMA,
        "scope_counters": counters,
        "set_id": _id(set_id, "set_id"),
        "source_capability_status": source_capability_status,
        "status": "TERMINAL" if verdict != "UNKNOWN" else "UNKNOWN",
        "status_after_sha256": status_after_sha256,
        "status_before_sha256": status_before_sha256,
        "terminal_id": f"terminal:{sha256_json({'bead_id': bead_id, 'decision_id': decision_id, 'set_id': set_id, 'verdict': verdict})[:32]}",
        "terminal_sha256": ZERO_SHA256,
        "token_usage": {"status": "unavailable"},
        "verdict": verdict,
    }
    terminal["terminal_sha256"] = sha256_json({key: value for key, value in terminal.items() if key != "terminal_sha256"})
    return terminal


def validate_terminal(terminal: Mapping[str, Any]) -> dict[str, Any]:
    value = dict(terminal)
    required = {
        "actual_identity", "authority", "bead_id", "canonical_encoding",
        "decision_id", "defect", "evidence_refs", "proposal_ref", "replay",
        "requested_model", "requested_reasoning", "result_sha256", "schema",
        "scope_counters", "set_id", "source_capability_status", "status",
        "status_after_sha256", "status_before_sha256", "terminal_id",
        "terminal_sha256", "token_usage", "verdict",
    }
    if set(value) != required:
        raise EvidenceError("UNKNOWN_FIELD", "terminal is not closed")
    if value["schema"] != TERMINAL_SCHEMA or value["actual_identity"] != ACTUAL_IDENTITY:
        raise EvidenceError("INVALID_INPUT", "terminal schema or identity drift")
    if value["authority"] != AUTHORITY or value["canonical_encoding"] != CANONICAL_ENCODING:
        raise EvidenceError("INVALID_INPUT", "terminal authority or encoding drift")
    for field in ("result_sha256", "status_before_sha256", "status_after_sha256", "terminal_sha256"):
        if not isinstance(value[field], str) or len(value[field]) != 64:
            raise EvidenceError("INVALID_INPUT", f"terminal.{field} is not SHA-256")
    if value["scope_counters"].get("network_calls") != 0 or value["scope_counters"].get("provider_calls") != 0:
        raise EvidenceError("SCOPE_VIOLATION", "terminal contains external calls")
    if value["terminal_sha256"] != sha256_json({key: item for key, item in value.items() if key != "terminal_sha256"}):
        raise EvidenceError("HASH_MISMATCH", "terminal hash is not bound")
    return value


def replay_canonical(value: Mapping[str, Any], *, pairs: int = 100) -> dict[str, int]:
    expected = canonical_bytes(value)
    mismatches = 0
    for _ in range(pairs):
        if canonical_bytes(dict(value)) != expected:
            mismatches += 1
    return {"pairs": pairs, "mismatches": mismatches}


def build_abstention(**kwargs: Any) -> dict[str, Any]:
    return make_abstention(**kwargs)


make_proposal = build_proposal
make_terminal = build_terminal

__all__ = [
    "ALLOWED_GAP_CODES",
    "PROPOSAL_SCHEMA",
    "SCOPE_COUNTER_KEYS",
    "TERMINAL_SCHEMA",
    "build_abstention",
    "build_proposal",
    "build_terminal",
    "make_proposal",
    "make_terminal",
    "replay_canonical",
    "validate_proposal",
    "validate_terminal",
]
