#!/usr/bin/env python3
"""Deterministic evidence deduplication and independent-source checks."""
from __future__ import annotations

import copy
from collections.abc import Iterable, Mapping
from typing import Any

try:
    from .compiler import sha256_json
    from .evidence import EvidenceError, validate_evidence_receipt
except ImportError:  # pragma: no cover - direct focused-test import
    from compiler import sha256_json
    from evidence import EvidenceError, validate_evidence_receipt


def _key(evidence: Mapping[str, Any]) -> tuple[str, str]:
    value = validate_evidence_receipt(evidence)
    return value["canonical_locator"], value["content_hash"]


def canonical_identity(evidence: Mapping[str, Any]) -> str:
    """Return a stable identity for dedupe and receipt binding."""
    locator, content_hash = _key(evidence)
    return sha256_json({"canonical_locator": locator, "content_hash": content_hash})


def _sort_key(evidence: Mapping[str, Any]) -> tuple[str, str, str, str]:
    value = validate_evidence_receipt(evidence)
    return (
        value["canonical_locator"],
        value["content_hash"],
        value["source_group"],
        value["evidence_id"],
    )


def deduplicate_evidence(
    evidence: Iterable[Mapping[str, Any]],
    *,
    return_report: bool = False,
) -> list[dict[str, Any]] | dict[str, Any]:
    """Dedupe by canonical locator plus content hash.

    The first record is selected by a canonical deterministic ordering. A
    duplicate from another group is metadata only; it does not manufacture
    corroboration.
    """
    values = [validate_evidence_receipt(item) for item in evidence]
    selected: dict[tuple[str, str], dict[str, Any]] = {}
    duplicate_ids: list[str] = []
    for value in sorted(values, key=_sort_key):
        key = _key(value)
        if key in selected:
            duplicate_ids.append(value["evidence_id"])
        else:
            selected[key] = copy.deepcopy(value)
    result = [selected[key] for key in sorted(selected)]
    if not return_report:
        return result
    groups = sorted({item["source_group"] for item in result})
    return {
        "records": result,
        "input_count": len(values),
        "unique_count": len(result),
        "duplicate_count": len(duplicate_ids),
        "duplicate_evidence_refs": sorted(duplicate_ids),
        "source_groups": groups,
    }


def independent_source_groups(evidence: Iterable[Mapping[str, Any]]) -> tuple[str, ...]:
    values = [validate_evidence_receipt(item) for item in evidence]
    return tuple(sorted({item["source_group"] for item in values}))


def corroboration_report(
    evidence: Iterable[Mapping[str, Any]],
    *,
    minimum_source_groups: int = 2,
    require_distinct_content: bool = False,
) -> dict[str, Any]:
    """Produce a deterministic report without granting execution authority."""
    if isinstance(minimum_source_groups, bool) or not isinstance(minimum_source_groups, int) or minimum_source_groups < 1:
        raise EvidenceError("INVALID_INPUT", "minimum_source_groups must be positive")
    values = [validate_evidence_receipt(item) for item in evidence]
    deduped = deduplicate_evidence(values)
    groups = independent_source_groups(deduped)
    if require_distinct_content:
        content_hashes = {item["content_hash"] for item in deduped}
        sufficient = len(groups) >= minimum_source_groups and len(content_hashes) >= minimum_source_groups
    else:
        sufficient = len(groups) >= minimum_source_groups
    return {
        "status": "PASS" if sufficient else "ABSTAINED",
        "minimum_source_groups": minimum_source_groups,
        "independent_source_count": len(groups),
        "independent_source_groups": list(groups),
        "evidence_refs": sorted(item["evidence_id"] for item in deduped),
        "canonical_identities": sorted(canonical_identity(item) for item in deduped),
        "require_distinct_content": require_distinct_content,
        "reason": "independent source groups meet threshold" if sufficient else "independent source groups are insufficient",
    }


def require_independent_sources(
    evidence: Iterable[Mapping[str, Any]],
    *,
    minimum_source_groups: int = 2,
    require_distinct_content: bool = False,
) -> dict[str, Any]:
    report = corroboration_report(
        evidence,
        minimum_source_groups=minimum_source_groups,
        require_distinct_content=require_distinct_content,
    )
    if report["status"] != "PASS":
        raise EvidenceError("CORROBORATION_INSUFFICIENT", report["reason"])
    return report


def has_independent_corroboration(
    evidence: Iterable[Mapping[str, Any]],
    *,
    minimum_source_groups: int = 2,
) -> bool:
    try:
        return corroboration_report(evidence, minimum_source_groups=minimum_source_groups)["status"] == "PASS"
    except EvidenceError:
        return False


def corroborate(
    evidence: Iterable[Mapping[str, Any]],
    *,
    minimum_source_groups: int = 2,
    require_distinct_content: bool = False,
) -> dict[str, Any]:
    return require_independent_sources(
        evidence,
        minimum_source_groups=minimum_source_groups,
        require_distinct_content=require_distinct_content,
    )


dedupe_evidence = deduplicate_evidence
corroborate_evidence = corroboration_report

__all__ = [
    "canonical_identity",
    "corroborate",
    "corroborate_evidence",
    "corroboration_report",
    "dedupe_evidence",
    "deduplicate_evidence",
    "has_independent_corroboration",
    "independent_source_groups",
    "require_independent_sources",
]
