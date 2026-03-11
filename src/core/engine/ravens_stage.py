from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from src.core.engine.hall_schema import normalize_hall_path

RavensStageName = Literal["memory", "hunt", "validate", "promote"]
RavensStageStatus = Literal["SUCCESS", "FAILURE", "SKIPPED", "NO_ACTION", "TRANSITIONAL"]


@dataclass(slots=True)
class RavensTargetIdentity:
    target_kind: str = "FILE"
    target_ref: str | None = None
    target_path: str | None = None
    bead_id: str | None = None
    rationale: str | None = None
    acceptance_criteria: str | None = None
    baseline_scores: dict[str, Any] = field(default_factory=dict)
    compatibility_source: str | None = None

    def __post_init__(self) -> None:
        if self.target_path:
            self.target_path = normalize_hall_path(self.target_path)
        if self.target_ref:
            if "/" in self.target_ref or "\\" in self.target_ref:
                self.target_ref = normalize_hall_path(self.target_ref)
        elif self.target_path:
            self.target_ref = self.target_path

    def to_dict(self) -> dict[str, Any]:
        return {
            "target_kind": self.target_kind,
            "target_ref": self.target_ref,
            "target_path": self.target_path,
            "bead_id": self.bead_id,
            "rationale": self.rationale,
            "acceptance_criteria": self.acceptance_criteria,
            "baseline_scores": dict(self.baseline_scores),
            "compatibility_source": self.compatibility_source,
        }


@dataclass(slots=True)
class RavensHallReferenceSet:
    repo_id: str
    observation_id: str | None = None
    validation_id: str | None = None
    scan_id: str | None = None
    bead_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "repo_id": self.repo_id,
            "observation_id": self.observation_id,
            "validation_id": self.validation_id,
            "scan_id": self.scan_id,
            "bead_id": self.bead_id,
        }


@dataclass(slots=True)
class RavensStageResult:
    stage: RavensStageName
    status: RavensStageStatus
    summary: str
    target: RavensTargetIdentity | None = None
    hall: RavensHallReferenceSet | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "stage": self.stage,
            "status": self.status,
            "summary": self.summary,
            "target": self.target.to_dict() if self.target else None,
            "hall": self.hall.to_dict() if self.hall else None,
            "metadata": dict(self.metadata),
        }


@dataclass(slots=True)
class RavensCycleResult:
    status: RavensStageStatus
    summary: str
    mission_id: str
    trace_id: str | None = None
    target: RavensTargetIdentity | None = None
    stages: list[RavensStageResult] = field(default_factory=list)
    hall: RavensHallReferenceSet | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "summary": self.summary,
            "mission_id": self.mission_id,
            "trace_id": self.trace_id,
            "target": self.target.to_dict() if self.target else None,
            "stages": [stage.to_dict() for stage in self.stages],
            "hall": self.hall.to_dict() if self.hall else None,
            "metadata": dict(self.metadata),
        }
