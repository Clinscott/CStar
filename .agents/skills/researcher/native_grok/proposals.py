"""Evidence-only Researcher proposals and typed handoff helpers."""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

try:
    from .compiler import sha256_json
    from .evidence import (
        ACTUAL_IDENTITY,
        AUTHORITY,
        MODEL,
        REASONING,
        ZERO_SHA256,
        build_abstention,
        validate_evidence,
    )
except ImportError:  # pragma: no cover - direct host imports.
    from compiler import sha256_json
    from evidence import ACTUAL_IDENTITY, AUTHORITY, MODEL, REASONING, ZERO_SHA256, build_abstention, validate_evidence


PROPOSAL_SCHEMA = "researcher.proposal.v1"


class ProposalError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(f"{code}: {message}")


def _without(value: Mapping[str, Any], key: str) -> dict[str, Any]:
    result = dict(value)
    result.pop(key, None)
    return result


def _id(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value or len(value) > 128 or any(
        char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:-" for char in value
    ) or not value[0].isalnum():
        raise ProposalError("INVALID_INPUT", f"{name} is not a bounded identifier")
    return value


def _text(value: Any, name: str, maximum: int = 1024) -> str:
    if not isinstance(value, str) or not value or len(value) > maximum or any(ord(char) < 0x20 or ord(char) == 0x7F for char in value):
        raise ProposalError("INVALID_INPUT", f"{name} is not bounded text")
    return value


def _refs(value: Any, name: str, *, minimum: int = 0) -> list[str]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes, bytearray)):
        raise ProposalError("INVALID_INPUT", f"{name} must be an array")
    result = sorted({_id(item, f"{name}[]") for item in value})
    if len(result) < minimum or len(result) > 32:
        raise ProposalError("INVALID_INPUT", f"{name} is outside its bound")
    return result


def _claims(
    values: Sequence[Mapping[str, Any]] | None,
    evidence_ids: set[str],
    *,
    state: str,
    inferred: bool,
) -> list[dict[str, Any]]:
    if values is None:
        return []
    if isinstance(values, (str, bytes, bytearray)) or not isinstance(values, Sequence):
        raise ProposalError("INVALID_INPUT", "claims must be an array")
    result: list[dict[str, Any]] = []
    for claim in values:
        if not isinstance(claim, Mapping):
            raise ProposalError("INVALID_INPUT", "claim must be an object")
        refs = _refs(claim.get("evidence_refs", []), "claim.evidence_refs", minimum=1)
        if not set(refs).issubset(evidence_ids):
            raise ProposalError("CITATION_INVALID", "claim references unknown evidence")
        body: dict[str, Any] = {
            "claim_id": _id(claim.get("claim_id"), "claim_id"),
            "evidence_refs": refs,
            "state": state,
            "statement": _text(claim.get("statement"), "claim.statement"),
        }
        if inferred:
            body["inference_rule"] = _id(claim.get("inference_rule"), "claim.inference_rule")
        if set(claim) - set(body):
            raise ProposalError("UNKNOWN_FIELD", "claim contains an unknown field")
        result.append(body)
    if len(result) > 32:
        raise ProposalError("INVALID_INPUT", "claim count exceeds bound")
    return sorted(result, key=lambda item: item["claim_id"])


def build_proposal(
    evidence: Sequence[Mapping[str, Any]],
    *,
    bead_id: str = "bead:r3:evidence",
    decision_id: str = "CSO-D003-R3",
    set_id: str = "CSO-D003-R3-SET-01",
    observed_claims: Sequence[Mapping[str, Any]] | None = None,
    inferred_claims: Sequence[Mapping[str, Any]] | None = None,
    unavailable_gaps: Sequence[Mapping[str, Any]] = (),
    risks: Sequence[Mapping[str, Any]] = (),
    recommended_next_steps: Sequence[Mapping[str, Any]] = (),
) -> dict[str, Any]:
    """Create a proposal with execution permanently disabled."""

    if isinstance(evidence, (str, bytes, bytearray)) or not isinstance(evidence, Sequence):
        raise ProposalError("INVALID_INPUT", "evidence must be an array")
    bound_evidence = [dict(item) for item in evidence]
    for item in bound_evidence:
        validate_evidence(item)
    bound_evidence.sort(key=lambda item: item["evidence_id"])
    evidence_refs = sorted({item["evidence_id"] for item in bound_evidence})
    evidence_ids = set(evidence_refs)
    if observed_claims is None:
        observed_claims = [
            {
                "claim_id": f"claim:observed:{item['evidence_id']}",
                "evidence_refs": [item["evidence_id"]],
                "statement": f"Source observation is bound to {item['canonical_locator']}.",
            }
            for item in bound_evidence
        ]
    observed = _claims(observed_claims, evidence_ids, state="OBSERVED", inferred=False)
    inferred = _claims(inferred_claims, evidence_ids, state="INFERRED", inferred=True)
    gaps: list[dict[str, Any]] = []
    valid_gap_codes = {
        "ATTEMPT_TELEMETRY_UNAVAILABLE", "AUTH_CUSTODY_UNPROVEN", "BUDGET_OVERSHOOT",
        "CAPABILITY_PROFILE_UNSATISFIED", "CANCELLED", "CITATION_INVALID",
        "CORROBORATION_INSUFFICIENT", "DEADLINE_EXCEEDED", "INVALID_INPUT",
        "REDACTION_REQUIRED", "SOURCE_UNAVAILABLE", "TERMINAL_UNKNOWN", "UNKNOWN_FIELD",
    }
    for gap in unavailable_gaps:
        if not isinstance(gap, Mapping):
            raise ProposalError("INVALID_INPUT", "gap must be an object")
        body = {
            "code": gap.get("code"),
            "description": _text(gap.get("description"), "gap.description"),
            "gap_id": _id(gap.get("gap_id"), "gap_id"),
        }
        if body["code"] not in valid_gap_codes:
            raise ProposalError("INVALID_INPUT", "gap code is not closed")
        if set(gap) - set(body):
            raise ProposalError("UNKNOWN_FIELD", "gap contains an unknown field")
        gaps.append(body)
    risks_out: list[dict[str, Any]] = []
    for risk in risks:
        if not isinstance(risk, Mapping) or set(risk) - {"description", "risk_id", "severity"}:
            raise ProposalError("UNKNOWN_FIELD", "risk shape is not closed")
        severity = risk.get("severity")
        if severity not in {"high", "medium", "low"}:
            raise ProposalError("INVALID_INPUT", "risk severity is not closed")
        risks_out.append(
            {
                "description": _text(risk.get("description"), "risk.description"),
                "risk_id": _id(risk.get("risk_id"), "risk_id"),
                "severity": severity,
            }
        )
    steps_out: list[dict[str, Any]] = []
    for step in recommended_next_steps:
        if not isinstance(step, Mapping) or set(step) - {"action", "bounded_scope", "reversibility", "step_id"}:
            raise ProposalError("UNKNOWN_FIELD", "next step shape is not closed")
        if step.get("reversibility") not in {"operator_gated", "reversible"}:
            raise ProposalError("INVALID_INPUT", "next-step reversibility is not closed")
        steps_out.append(
            {
                "action": _text(step.get("action"), "step.action"),
                "bounded_scope": _text(step.get("bounded_scope"), "step.bounded_scope"),
                "reversibility": step["reversibility"],
                "step_id": _id(step.get("step_id"), "step_id"),
            }
        )
    if len(gaps) > 32 or len(risks_out) > 32 or len(steps_out) > 16:
        raise ProposalError("INVALID_INPUT", "proposal collection exceeds bound")
    gaps.sort(key=lambda item: item["gap_id"])
    risks_out.sort(key=lambda item: item["risk_id"])
    steps_out.sort(key=lambda item: item["step_id"])
    body: dict[str, Any] = {
        "actual_identity": ACTUAL_IDENTITY,
        "authority": dict(AUTHORITY),
        "bead_id": _id(bead_id, "bead_id"),
        "decision_id": _id(decision_id, "decision_id"),
        "evidence_refs": evidence_refs,
        "execution_allowed": False,
        "inferred_claims": inferred,
        "observed_claims": observed,
        "proposal_id": "pending",
        "proposal_sha256": ZERO_SHA256,
        "recommended_next_steps": steps_out,
        "requested_model": MODEL,
        "requested_reasoning": REASONING,
        "risks": risks_out,
        "schema": PROPOSAL_SCHEMA,
        "set_id": _id(set_id, "set_id"),
        "unavailable_gaps": gaps,
    }
    body["proposal_id"] = f"proposal:{sha256_json(_without(body, 'proposal_sha256'))[:48]}"
    body["proposal_sha256"] = sha256_json(_without(body, "proposal_sha256"))
    return body


def make_proposal(*args: Any, **kwargs: Any) -> dict[str, Any]:
    return build_proposal(*args, **kwargs)


def validate_proposal(value: Mapping[str, Any]) -> bool:
    if not isinstance(value, Mapping) or value.get("schema") != PROPOSAL_SCHEMA:
        raise ProposalError("INVALID_INPUT", "not a proposal v1 object")
    if value.get("execution_allowed") is not False or value.get("actual_identity") != ACTUAL_IDENTITY:
        raise ProposalError("INVALID_INPUT", "proposal authority fields drifted")
    if value.get("proposal_sha256") != sha256_json(_without(value, "proposal_sha256")):
        raise ProposalError("HASH_MISMATCH", "proposal hash mismatch")
    return True


# Re-export the typed abstention constructor at the proposal boundary.
make_abstention = build_abstention
typed_abstention = build_abstention

