"""Deterministic evidence deduplication and independent-source checks."""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

try:
    from .evidence import EvidenceError, build_abstention, evidence_identity, validate_evidence
except ImportError:  # pragma: no cover - direct host imports.
    from evidence import EvidenceError, build_abstention, evidence_identity, validate_evidence


class CorroborationInsufficient(EvidenceError):
    def __init__(self, message: str) -> None:
        super().__init__("CORROBORATION_INSUFFICIENT", message)


def _canonical_sort_key(value: Mapping[str, Any]) -> tuple[str, str, str, str, str]:
    return (
        str(value.get("canonical_locator", "")),
        str(value.get("content_hash", "")),
        str(value.get("source_group", "")),
        str(value.get("source_receipt_hash", "")),
        str(value.get("evidence_id", "")),
    )


def dedupe_evidence(evidence: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Dedupe by canonical locator plus content hash.

    Sorting before selection makes the result independent of fixture record
    order.  The selected item is the lexicographically smallest fully bound
    receipt for a duplicate identity.
    """

    if isinstance(evidence, (str, bytes, bytearray)) or not isinstance(evidence, Sequence):
        raise EvidenceError("INVALID_INPUT", "evidence must be an array")
    ordered: list[dict[str, Any]] = []
    for item in evidence:
        if not isinstance(item, Mapping):
            raise EvidenceError("INVALID_INPUT", "evidence item must be an object")
        validate_evidence(item)
        ordered.append(dict(item))
    ordered.sort(key=_canonical_sort_key)
    unique: dict[tuple[str, str], dict[str, Any]] = {}
    for item in ordered:
        unique.setdefault(evidence_identity(item), item)
    return [unique[key] for key in sorted(unique)]


def deduplicate_evidence(evidence: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    return dedupe_evidence(evidence)


def dedupe_with_metrics(evidence: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    unique = dedupe_evidence(evidence)
    return {
        "evidence": unique,
        "input_count": len(evidence),
        "unique_count": len(unique),
        "duplicate_count": len(evidence) - len(unique),
    }


def independent_source_groups(evidence: Sequence[Mapping[str, Any]]) -> tuple[str, ...]:
    """Return distinct source groups after deterministic deduplication."""

    unique = dedupe_evidence(evidence)
    return tuple(sorted({item["source_group"] for item in unique}))


def corroborate_evidence(
    evidence: Sequence[Mapping[str, Any]],
    *,
    required_source_groups: int = 2,
    bead_id: str = "bead:r3:evidence",
    decision_id: str = "CSO-D003-R3",
    set_id: str = "CSO-D003-R3-SET-01",
) -> dict[str, Any]:
    """Return deterministic corroboration metrics or a typed abstention."""

    if isinstance(required_source_groups, bool) or not isinstance(required_source_groups, int) or required_source_groups < 1:
        raise EvidenceError("INVALID_INPUT", "required_source_groups must be positive")
    metrics = dedupe_with_metrics(evidence)
    groups = tuple(sorted({item["source_group"] for item in metrics["evidence"]}))
    if len(groups) < required_source_groups:
        abstention = build_abstention(
            "CORROBORATION_INSUFFICIENT",
            reason=f"Only {len(groups)} independent source group(s) are available; {required_source_groups} required.",
            stage="source",
            evidence_refs=[item["evidence_id"] for item in metrics["evidence"]],
            bead_id=bead_id,
            decision_id=decision_id,
            set_id=set_id,
        )
        return {
            "status": "ABSTAINED",
            "corroborated": False,
            "required_source_groups": required_source_groups,
            "independent_source_groups": list(groups),
            "evidence": metrics["evidence"],
            "duplicate_count": metrics["duplicate_count"],
            "abstention": abstention,
        }
    return {
        "status": "PASS",
        "corroborated": True,
        "required_source_groups": required_source_groups,
        "independent_source_groups": list(groups),
        "evidence": metrics["evidence"],
        "duplicate_count": metrics["duplicate_count"],
        "abstention": None,
    }


def require_corroboration(
    evidence: Sequence[Mapping[str, Any]], *, required_source_groups: int = 2
) -> list[dict[str, Any]]:
    result = corroborate_evidence(evidence, required_source_groups=required_source_groups)
    if not result["corroborated"]:
        abstention = result["abstention"]
        raise CorroborationInsufficient(abstention["reason"] if abstention else "independent-source proof is insufficient")
    return result["evidence"]


# Compact aliases for callers that use the noun-first spelling.
dedupe = dedupe_evidence
corroborate = corroborate_evidence

