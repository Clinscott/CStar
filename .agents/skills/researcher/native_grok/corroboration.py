#!/usr/bin/env python3
"""Deterministic dedupe and independent-source corroboration."""
from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from typing import Any

try:
    from .evidence import EvidenceError, validate_evidence
except ImportError:
    from evidence import EvidenceError, validate_evidence


class CorroborationError(ValueError):
    code = "CORROBORATION_INSUFFICIENT"

    def __init__(self, message: str, *, groups: Sequence[str] = ()) -> None:
        self.groups = tuple(groups)
        super().__init__(message)


def _identity(item: Mapping[str, Any]) -> tuple[str, str]:
    locator = item.get("canonical_locator")
    content_hash = item.get("content_hash")
    if not isinstance(locator, str) or not isinstance(content_hash, str):
        raise EvidenceError("INVALID_INPUT", "evidence lacks dedupe identity")
    return locator, content_hash


def dedupe_with_stats(records: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    if not isinstance(records, Sequence) or isinstance(records, (str, bytes, bytearray)):
        raise EvidenceError("INVALID_INPUT", "evidence records must be an array")
    checked = []
    for item in records:
        validate_evidence(item)
        checked.append(dict(item))
    unique: dict[tuple[str, str], dict[str, Any]] = {}
    duplicate_count = 0
    for item in checked:
        key = _identity(item)
        if key in unique:
            duplicate_count += 1
            continue
        unique[key] = item
    ordered = [unique[key] for key in sorted(unique)]
    return {"records": ordered, "duplicate_count": duplicate_count, "input_count": len(checked), "unique_count": len(ordered)}


def dedupe_evidence(records: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    return dedupe_with_stats(records)["records"]


deduplicate_evidence = dedupe_evidence


def corroborate_evidence(
    records: Sequence[Mapping[str, Any]],
    *,
    required_source_groups: int = 2,
    claim_key: str | Callable[[Mapping[str, Any]], Any] | None = None,
) -> dict[str, Any]:
    if isinstance(required_source_groups, bool) or not isinstance(required_source_groups, int) or required_source_groups < 1:
        raise EvidenceError("INVALID_INPUT", "required source-group count is invalid")
    stats = dedupe_with_stats(records)
    groups: dict[str, list[dict[str, Any]]] = {}
    for item in records:
        validate_evidence(item)
        if callable(claim_key):
            key = str(claim_key(item))
        elif isinstance(claim_key, str):
            key = str(item.get(claim_key, ""))
        else:
            key = "__all__"
        groups.setdefault(key, []).append(dict(item))
    group_results = []
    for key in sorted(groups):
        source_groups = sorted({item["source_group"] for item in groups[key]})
        evidence_ids = sorted({item["evidence_id"] for item in groups[key]})
        group_results.append({
            "claim_key": key,
            "corroborated": len(source_groups) >= required_source_groups,
            "evidence_ids": evidence_ids,
            "source_groups": source_groups,
        })
    passed = bool(group_results) and all(item["corroborated"] for item in group_results)
    independent = sorted({group for item in group_results for group in item["source_groups"]})
    return {
        "code": None if passed else CorroborationError.code,
        "corroborated": passed,
        "duplicate_count": stats["duplicate_count"],
        "groups": group_results,
        "independent_source_groups": independent,
        "required_source_groups": required_source_groups,
        "status": "PASS" if passed else "ABSTAINED",
        "unique_count": stats["unique_count"],
    }


def require_independent_corroboration(
    records: Sequence[Mapping[str, Any]], *, required_source_groups: int = 2, claim_key: str | Callable[[Mapping[str, Any]], Any] | None = None
) -> dict[str, Any]:
    result = corroborate_evidence(records, required_source_groups=required_source_groups, claim_key=claim_key)
    if not result["corroborated"]:
        raise CorroborationError("independent source corroboration is insufficient", groups=result["independent_source_groups"])
    return result


corroborate = corroborate_evidence

