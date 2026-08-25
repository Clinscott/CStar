from __future__ import annotations

import contextlib
import hashlib
import json
import sqlite3
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Literal

from src.core.engine.gungnir.schema import GungnirMatrix, build_gungnir_matrix, get_gungnir_overall, matrix_to_dict

HallRepositoryStatus = Literal["DORMANT", "AWAKE", "AGENT_LOOP"]
HallScanStatus = Literal["PENDING", "COMPLETED", "FAILED"]
HallBeadStatus = Literal["OPEN", "SET-PENDING", "SET", "IN_PROGRESS", "READY_FOR_REVIEW", "NEEDS_TRIAGE", "BLOCKED", "RESOLVED", "ARCHIVED", "SUPERSEDED"]
HallBeadTargetKind = Literal["FILE", "SECTOR", "REPOSITORY", "CONTRACT", "SPOKE", "WORKFLOW", "WEAVE", "SKILL", "SYSTEM", "VALIDATION", "OTHER"]
HallValidationVerdict = Literal["ACCEPTED", "REJECTED", "INCONCLUSIVE", "SUCCESS", "FAILURE"]
HallSkillProposalStatus = Literal["PROPOSED", "VALIDATED", "PROMOTED", "REJECTED", "SUPERSEDED"]
HallPlanningSessionStatus = Literal[
    "INTENT_RECEIVED",
    "RESEARCH_PHASE",
    "PROPOSAL_REVIEW",
    "BEAD_CRITIQUE_LOOP",
    "BEAD_USER_REVIEW",
    "PLAN_CONCRETE",
    "FORGE_EXECUTION",
    "NEEDS_INPUT",
    "PLAN_READY",
    "ROUTED",
    "COMPLETED",
    "FAILED",
]


def _require_non_empty_str(field_name: str, value: Any) -> None:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field_name} must be a non-empty string")


def _require_status(field_name: str, value: Any, allowed: tuple[str, ...]) -> None:
    if value not in allowed:
        raise ValueError(f"{field_name} must be one of: {', '.join(allowed)}")


def _require_non_negative_int(field_name: str, value: Any) -> None:
    if not isinstance(value, int) or value < 0:
        raise ValueError(f"{field_name} must be a non-negative integer")


def _require_dict(field_name: str, value: Any) -> None:
    if not isinstance(value, dict):
        raise ValueError(f"{field_name} must be a dict")


def _require_list(field_name: str, value: Any) -> None:
    if not isinstance(value, list):
        raise ValueError(f"{field_name} must be a list")


@dataclass
class HallRepositoryRecord:
    repo_id: str
    root_path: str
    name: str
    status: HallRepositoryStatus = "DORMANT"
    active_persona: str = ""
    baseline_gungnir_score: float = 0.0
    intent_integrity: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: int = 0
    updated_at: int = 0

    def __post_init__(self) -> None:
        _require_non_empty_str("repo_id", self.repo_id)
        _require_non_empty_str("root_path", self.root_path)
        _require_non_empty_str("name", self.name)
        _require_status("status", self.status, ("DORMANT", "AWAKE", "AGENT_LOOP"))
        if not isinstance(self.active_persona, str):
            raise ValueError("active_persona must be a string")
        _require_dict("metadata", self.metadata)
        _require_non_negative_int("created_at", self.created_at)
        _require_non_negative_int("updated_at", self.updated_at)


@dataclass
class HallScanRecord:
    scan_id: str
    repo_id: str
    scan_kind: str
    status: HallScanStatus
    started_at: int
    baseline_gungnir_score: float = 0.0
    completed_at: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        _require_non_empty_str("scan_id", self.scan_id)
        _require_non_empty_str("repo_id", self.repo_id)
        _require_non_empty_str("scan_kind", self.scan_kind)
        _require_status("status", self.status, ("PENDING", "COMPLETED", "FAILED"))
        _require_non_negative_int("started_at", self.started_at)
        if self.completed_at is not None:
            _require_non_negative_int("completed_at", self.completed_at)
        _require_dict("metadata", self.metadata)


@dataclass
class HallFileRecord:
    repo_id: str
    scan_id: str
    path: str
    created_at: int
    content_hash: str | None = None
    language: str | None = None
    gungnir_score: float = 0.0
    matrix: GungnirMatrix | dict[str, Any] = field(default_factory=GungnirMatrix)
    imports: list[dict[str, str]] = field(default_factory=list)
    exports: list[str] = field(default_factory=list)
    intent_summary: str | None = None
    interaction_summary: str | None = None

    def __post_init__(self) -> None:
        _require_non_empty_str("repo_id", self.repo_id)
        _require_non_empty_str("scan_id", self.scan_id)
        _require_non_empty_str("path", self.path)
        _require_non_negative_int("created_at", self.created_at)
        _require_list("imports", self.imports)
        _require_list("exports", self.exports)


@dataclass
class HallBeadRecord:
    bead_id: str
    repo_id: str
    rationale: str
    created_at: int
    updated_at: int
    scan_id: str | None = None
    legacy_id: int | None = None
    target_kind: HallBeadTargetKind = "FILE"
    target_ref: str | None = None
    target_path: str | None = None
    contract_refs: list[str] = field(default_factory=list)
    baseline_scores: dict[str, Any] = field(default_factory=dict)
    acceptance_criteria: str | None = None
    checker_shell: str | None = None
    status: HallBeadStatus = "OPEN"
    assigned_agent: str | None = None
    source_kind: str | None = None
    triage_reason: str | None = None
    resolution_note: str | None = None
    resolved_validation_id: str | None = None
    superseded_by: str | None = None

    def __post_init__(self) -> None:
        _require_non_empty_str("bead_id", self.bead_id)
        _require_non_empty_str("repo_id", self.repo_id)
        _require_non_empty_str("rationale", self.rationale)
        _require_non_negative_int("created_at", self.created_at)
        _require_non_negative_int("updated_at", self.updated_at)
        _require_status("target_kind", self.target_kind, ("FILE", "SECTOR", "REPOSITORY", "CONTRACT", "SPOKE", "WORKFLOW", "WEAVE", "SKILL", "SYSTEM", "VALIDATION", "OTHER"))
        _require_status("status", self.status, ("OPEN", "SET-PENDING", "SET", "IN_PROGRESS", "READY_FOR_REVIEW", "NEEDS_TRIAGE", "BLOCKED", "RESOLVED", "ARCHIVED", "SUPERSEDED"))
        _require_list("contract_refs", self.contract_refs)
        _require_dict("baseline_scores", self.baseline_scores)


@dataclass
class HallValidationRun:
    validation_id: str
    repo_id: str
    verdict: HallValidationVerdict
    created_at: int
    scan_id: str | None = None
    bead_id: str | None = None
    target_path: str | None = None
    sprt_verdict: str | None = None
    pre_scores: dict[str, Any] = field(default_factory=dict)
    post_scores: dict[str, Any] = field(default_factory=dict)
    benchmark: dict[str, Any] = field(default_factory=dict)
    notes: str | None = None
    legacy_trace_id: int | None = None


@dataclass
class HallSkillObservation:
    observation_id: str
    repo_id: str
    skill_id: str
    outcome: str
    observation: str
    created_at: int
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class HallEpisodicMemoryRecord:
    memory_id: str
    bead_id: str
    repo_id: str
    tactical_summary: str
    created_at: int
    updated_at: int
    files_touched: list[str] = field(default_factory=list)
    successes: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class HallSkillProposalRecord:
    proposal_id: str
    repo_id: str
    skill_id: str
    status: HallSkillProposalStatus
    created_at: int
    updated_at: int
    bead_id: str | None = None
    validation_id: str | None = None
    target_path: str | None = None
    contract_path: str | None = None
    proposal_path: str | None = None
    summary: str | None = None
    promotion_note: str | None = None
    promoted_at: int | None = None
    promoted_by: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class HallPlanningSessionRecord:
    session_id: str
    repo_id: str
    skill_id: str
    status: HallPlanningSessionStatus
    user_intent: str
    normalized_intent: str
    created_at: int
    updated_at: int
    summary: str | None = None
    latest_question: str | None = None
    architect_opinion: str | None = None
    current_bead_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


def normalize_hall_path(input_path: str | Path) -> str:
    return str(input_path).replace("\\", "/").rstrip("/")


def build_repo_id(root_path: str | Path) -> str:
    return f"repo:{normalize_hall_path(root_path)}"


PERSONA_PROJECTION_SCHEMA = "cstar.persona_projection.v2"
PERSONA_PROJECTION_INTEGRITY = "sha256_self_consistency"
LEGACY_PERSONA_PROJECTION_SCHEMA = "cstar.persona_projection.v1"
_LEGACY_PERSONA_PROJECTION_AUTHORITY = "cstar_status"
_LEGACY_PERSONA_PROJECTION_VERIFICATION = "kernel_projection"
CANONICAL_PERSONAS = frozenset({"O.D.I.N.", "A.L.F.R.E.D."})


def _persona_digest(persona: str) -> str:
    return hashlib.sha256(persona.encode("utf-8")).hexdigest()


def build_persona_projection_metadata(persona: str) -> dict[str, Any]:
    if persona not in CANONICAL_PERSONAS:
        raise ValueError("persona_projection_canonical_value_required")
    return {
        "persona_projection": {
            "schema": PERSONA_PROJECTION_SCHEMA,
            "integrity": PERSONA_PROJECTION_INTEGRITY,
            "value_sha256": _persona_digest(persona),
        }
    }


def persona_projection_consistency_status(
    metadata: dict[str, Any] | None,
    active_persona: str | None = None,
) -> str:
    persona = active_persona if active_persona in CANONICAL_PERSONAS else None
    attestation = (metadata or {}).get("persona_projection")
    if not persona or not isinstance(attestation, dict):
        return "unavailable"
    if attestation.get("value_sha256") != _persona_digest(persona):
        return "unavailable"
    if (
        attestation.get("schema") == PERSONA_PROJECTION_SCHEMA
        and attestation.get("integrity") == PERSONA_PROJECTION_INTEGRITY
    ):
        return "self_consistent_unverified"
    if (
        attestation.get("schema") == LEGACY_PERSONA_PROJECTION_SCHEMA
        and attestation.get("authority") == _LEGACY_PERSONA_PROJECTION_AUTHORITY
        and attestation.get("verification") == _LEGACY_PERSONA_PROJECTION_VERIFICATION
    ):
        return "legacy_self_consistent_unverified"
    return "unavailable"


def is_persona_projection_self_consistent(
    metadata: dict[str, Any] | None,
    active_persona: str | None = None,
) -> bool:
    return persona_projection_consistency_status(metadata, active_persona) != "unavailable"
