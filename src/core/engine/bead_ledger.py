"""Pure bead schemas for a retired direct Python Hall ledger.

All lifecycle reads and mutations must use the CStar kernel.  The schema and
normalization helpers remain available for detached parsing only.
"""

from __future__ import annotations

import json
import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any, NoReturn

from src.core.engine.hall_schema import HallBeadRecord


LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR = (
    "legacy_python_autonomous_effect_surface_retired_use_cstar_kernel"
)
PROJECTION_STATUS_ORDER = (
    "OPEN",
    "SET-PENDING",
    "SET",
    "IN_PROGRESS",
    "READY_FOR_REVIEW",
    "NEEDS_TRIAGE",
    "BLOCKED",
    "RESOLVED",
    "ARCHIVED",
    "SUPERSEDED",
)
PROJECTION_MARKERS = {
    "OPEN": "[ ]",
    "SET-PENDING": "[P]",
    "SET": "[S]",
    "IN_PROGRESS": "[/]",
    "READY_FOR_REVIEW": "[>]",
    "NEEDS_TRIAGE": "[?]",
    "BLOCKED": "[!]",
    "RESOLVED": "[x]",
    "ARCHIVED": "[-]",
    "SUPERSEDED": "[~]",
}
NON_EXECUTABLE_CONTRACT_PREFIXES = ("lore:", "workflow:", "registry:")


def _retired() -> NoReturn:
    raise RuntimeError(LEGACY_PYTHON_AUTONOMOUS_EFFECT_ERROR)


def _normalize_contract_ref(ref: Any) -> str | None:
    value = str(ref or "").strip()
    return value or None


def _normalized_contract_refs(
    contract_refs: Sequence[str] | None,
) -> tuple[str, ...]:
    normalized = {_normalize_contract_ref(ref) for ref in (contract_refs or [])}
    return tuple(sorted(ref for ref in normalized if ref))


def _normalize_duplicate_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip().lower().replace("`", "")
    if not text:
        return None
    text = re.sub(r"[^\w\s./:-]+", " ", text)
    return re.sub(r"\s+", " ", text).strip(" .") or None


def _duplicate_text_matches(left: str | None, right: str | None) -> bool:
    if left == right:
        return True
    if not left or not right:
        return False
    left_tokens = set(left.split())
    right_tokens = set(right.split())
    if not left_tokens or not right_tokens:
        return False
    overlap = len(left_tokens & right_tokens) / len(left_tokens | right_tokens)
    return overlap >= 0.70 or SequenceMatcher(None, left, right).ratio() >= 0.78


def _has_executable_contract_refs(
    contract_refs: Sequence[str] | None,
) -> bool:
    return any(
        not ref.lower().startswith(NON_EXECUTABLE_CONTRACT_PREFIXES)
        for ref in _normalized_contract_refs(contract_refs)
    )


@dataclass(slots=True)
class SovereignBead:
    id: str
    repo_id: str
    scan_id: str
    rationale: str
    created_at: int
    updated_at: int
    target_kind: str = "FILE"
    target_ref: str | None = None
    target_path: str | None = None
    contract_refs: list[str] = field(default_factory=list)
    baseline_scores: dict[str, Any] = field(default_factory=dict)
    acceptance_criteria: str | None = None
    checker_shell: str | None = None
    status: str = "OPEN"
    assigned_agent: str | None = None
    legacy_id: int | None = None
    source_kind: str | None = None
    triage_reason: str | None = None
    resolution_note: str | None = None
    resolved_validation_id: str | None = None
    superseded_by: str | None = None

    def to_record(self) -> HallBeadRecord:
        return HallBeadRecord(
            bead_id=self.id,
            repo_id=self.repo_id,
            scan_id=self.scan_id,
            legacy_id=self.legacy_id,
            target_kind=self.target_kind,
            target_ref=self.target_ref,
            target_path=self.target_path,
            rationale=self.rationale,
            contract_refs=self.contract_refs,
            baseline_scores=self.baseline_scores,
            acceptance_criteria=self.acceptance_criteria,
            checker_shell=self.checker_shell,
            status=self.status,
            assigned_agent=self.assigned_agent,
            source_kind=self.source_kind,
            triage_reason=self.triage_reason,
            resolution_note=self.resolution_note,
            resolved_validation_id=self.resolved_validation_id,
            superseded_by=self.superseded_by,
            created_at=self.created_at,
            updated_at=self.updated_at,
        )

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "repo_id": self.repo_id,
            "scan_id": self.scan_id,
            "target_kind": self.target_kind,
            "target_ref": self.target_ref,
            "target_path": self.target_path,
            "actionable": self._is_claimable_public(),
            "rationale": self.rationale,
            "description": self.rationale,
            "contract_refs": list(self.contract_refs),
            "baseline_scores": dict(self.baseline_scores),
            "acceptance_criteria": self.acceptance_criteria,
            "checker_shell": self.checker_shell,
            "status": self.status,
            "assigned_agent": self.assigned_agent,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "legacy_id": self.legacy_id,
            "source_kind": self.source_kind,
            "triage_reason": self.triage_reason,
            "resolution_note": self.resolution_note,
            "resolved_validation_id": self.resolved_validation_id,
            "superseded_by": self.superseded_by,
        }

    def _is_claimable_public(self) -> bool:
        return bool(
            (self.target_path or self.target_ref)
            and self.acceptance_criteria
            and _has_executable_contract_refs(self.contract_refs)
        )


class BeadLedger:
    """Fail-closed compatibility shell; no direct Hall access remains."""

    CLAIM_RETRY_LIMIT = 0

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        _retired()

    def connect(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def list_beads(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def peek_next_bead(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def claim_next_bead(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def claim_next_p1_scan_bead(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    def claim_bead(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def mark_ready_for_review(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    def block_bead(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def resolve_bead(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def get_bead(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def upsert_bead(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def normalize_existing_beads(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    def render_tasks_projection(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    def sync_tasks_projection(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    def projection_matches(self, *_args: object, **_kwargs: object) -> NoReturn:
        _retired()

    def find_projection_line(
        self, *_args: object, **_kwargs: object
    ) -> NoReturn:
        _retired()

    @staticmethod
    def has_executable_contract_refs(
        contract_refs: Sequence[str] | None,
    ) -> bool:
        return _has_executable_contract_refs(contract_refs)

    @staticmethod
    def _parse_json(value: str | bytes | None, fallback: Any) -> Any:
        if value in (None, ""):
            return fallback
        try:
            return json.loads(value)
        except (TypeError, ValueError, json.JSONDecodeError):
            return fallback

    @staticmethod
    def _merge_scores(
        existing: dict[str, Any] | None, incoming: dict[str, Any] | None
    ) -> dict[str, Any]:
        return {**dict(existing or {}), **dict(incoming or {})}

    @staticmethod
    def _normalize_target_kind(
        target_kind: str | None, target_path: str | None
    ) -> str:
        return (target_kind or ("FILE" if target_path else "GENERAL")).upper()

    @staticmethod
    def _normalize_target_ref(
        target_kind: str | None,
        target_ref: str | None,
        target_path: str | None,
    ) -> str | None:
        return target_ref or (target_path if (target_kind or "FILE") == "FILE" else None)
