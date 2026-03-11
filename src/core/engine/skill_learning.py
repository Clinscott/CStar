from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from src.core.engine.bead_ledger import BeadLedger, SovereignBead
from src.core.engine.hall_schema import (
    HallOfRecords,
    HallSkillObservation,
    HallSkillProposalRecord,
    HallValidationRun,
)
from src.core.engine.validation_result import ValidationResult


def _now_ms() -> int:
    return int(time.time() * 1000)


def _normalize_rel(path_value: Path, root: Path) -> str:
    try:
        return str(path_value.relative_to(root)).replace("\\", "/")
    except ValueError:
        return str(path_value).replace("\\", "/")


def _read_json(path_value: Path) -> dict[str, Any]:
    return json.loads(path_value.read_text(encoding="utf-8"))


def _write_json(path_value: Path, payload: dict[str, Any]) -> None:
    path_value.parent.mkdir(parents=True, exist_ok=True)
    path_value.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _infer_skill_contract(
    root: Path,
    bead: SovereignBead,
) -> tuple[str, Path]:
    for ref in bead.contract_refs:
        if ref.startswith("contract:"):
            skill_id = ref.split(":", 1)[1].strip()
            if skill_id:
                return skill_id, root / ".agents" / "skills" / skill_id / "contract.json"
        if ref.endswith("contract.json"):
            contract_path = Path(ref)
            if not contract_path.is_absolute():
                contract_path = root / ref
            skill_id = contract_path.parent.name
            return skill_id, contract_path

    if bead.target_path and bead.target_path.replace("\\", "/").endswith("contract.json"):
        contract_path = Path(bead.target_path)
        if not contract_path.is_absolute():
            contract_path = root / bead.target_path
        return contract_path.parent.name, contract_path

    raise ValueError(
        f"Bead '{bead.id}' does not identify a canonical skill contract. Use an explicit contract:<skill> reference."
    )


def _bump_contract_version(version: str | None) -> str:
    raw = (version or "1.0").strip()
    try:
        major_text, minor_text = raw.split(".", 1)
        return f"{int(major_text)}.{int(minor_text) + 1}"
    except Exception:
        return "1.1"


def _build_proposed_contract(
    current_contract: dict[str, Any],
    *,
    focus_axes: list[str],
    validation_profile: str,
) -> dict[str, Any]:
    proposed = json.loads(json.dumps(current_contract))
    proposed["version"] = _bump_contract_version(str(current_contract.get("version", "1.0")))
    defaults = dict(proposed.get("defaults") or {})
    if focus_axes:
        defaults["focus_axes"] = list(focus_axes)
    defaults["validation_profile"] = validation_profile
    defaults.setdefault("action", "propose")
    defaults.setdefault("simulate", True)
    proposed["defaults"] = defaults
    proposed["promotion_gate"] = {
        "requires_validation_verdict": "ACCEPTED",
        "requires_sprt_verdict": "ACCEPTED",
        "requires_bead_status": "READY_FOR_REVIEW",
    }
    actions = dict(proposed.get("actions") or {})
    actions.setdefault(
        "propose",
        "Generate a Hall-backed contract proposal from a validated bead-driven evolve run.",
    )
    actions.setdefault(
        "promote",
        "Promote a validated proposal into the canonical evolve contract.",
    )
    proposed["actions"] = actions
    return proposed


def _proposal_status_from_validation(
    validation: ValidationResult,
    *,
    dry_run: bool,
) -> str:
    if validation.verdict == "REJECTED":
        return "REJECTED"
    if not dry_run and validation.verdict == "ACCEPTED" and validation.sprt and validation.sprt.verdict == "ACCEPTED":
        return "VALIDATED"
    return "PROPOSED"


@dataclass(slots=True)
class SkillProposalMaterialization:
    record: HallSkillProposalRecord
    skill_id: str
    contract_path: str
    proposal_path: str
    proposal_payload: dict[str, Any]


@dataclass(slots=True)
class SkillPromotionResult:
    status: str
    proposal_id: str
    proposal_status: str
    skill_id: str
    validation_id: str
    contract_path: str
    promotion_outcome: str
    summary: str
    bead_id: str | None = None
    resolved: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "proposal_id": self.proposal_id,
            "proposal_status": self.proposal_status,
            "skill_id": self.skill_id,
            "validation_id": self.validation_id,
            "contract_path": self.contract_path,
            "promotion_outcome": self.promotion_outcome,
            "summary": self.summary,
            "bead_id": self.bead_id,
            "resolved": self.resolved,
            "metadata": dict(self.metadata),
        }


def materialize_skill_proposal(
    project_root: Path | str,
    *,
    bead: SovereignBead,
    validation: ValidationResult,
    validation_run: HallValidationRun,
    focus_axes: list[str],
    validation_profile: str,
    dry_run: bool,
    simulate: bool,
) -> SkillProposalMaterialization:
    root = Path(project_root)
    hall = HallOfRecords(root)
    repo = hall.bootstrap_repository()
    skill_id, contract_path = _infer_skill_contract(root, bead)
    current_contract = _read_json(contract_path)
    proposed_contract = _build_proposed_contract(
        current_contract,
        focus_axes=focus_axes,
        validation_profile=validation_profile,
    )
    proposal_id = f"proposal:{uuid.uuid4().hex[:12]}"
    created_at = _now_ms()
    proposal_dir = root / ".agents" / "proposals" / "evolve"
    proposal_path = proposal_dir / f"{proposal_id.replace(':', '_')}.json"
    status = _proposal_status_from_validation(validation, dry_run=dry_run)
    payload = {
        "proposal_id": proposal_id,
        "skill_id": skill_id,
        "bead_id": bead.id,
        "validation_id": validation.validation_id,
        "target_path": bead.target_path,
        "contract_path": _normalize_rel(contract_path, root),
        "proposal_status": status,
        "summary": "Evolve generated a canonical skill contract proposal. Promotion requires explicit validation-backed review.",
        "dry_run": dry_run,
        "simulate": simulate,
        "focus_axes": list(focus_axes),
        "validation_profile": validation_profile,
        "validation": validation.to_dict(),
        "validation_run": {
            "validation_id": validation_run.validation_id,
            "verdict": validation_run.verdict,
            "sprt_verdict": validation_run.sprt_verdict,
            "notes": validation_run.notes,
        },
        "current_contract": current_contract,
        "proposed_contract": proposed_contract,
    }
    _write_json(proposal_path, payload)
    record = HallSkillProposalRecord(
        proposal_id=proposal_id,
        repo_id=repo.repo_id,
        skill_id=skill_id,
        bead_id=bead.id,
        validation_id=validation.validation_id,
        target_path=bead.target_path,
        contract_path=_normalize_rel(contract_path, root),
        proposal_path=_normalize_rel(proposal_path, root),
        status=status,
        summary=str(payload["summary"]),
        created_at=created_at,
        updated_at=created_at,
        metadata={
            "focus_axes": list(focus_axes),
            "validation_profile": validation_profile,
            "dry_run": dry_run,
            "simulate": simulate,
        },
    )
    hall.save_skill_proposal(record)
    return SkillProposalMaterialization(
        record=record,
        skill_id=skill_id,
        contract_path=_normalize_rel(contract_path, root),
        proposal_path=_normalize_rel(proposal_path, root),
        proposal_payload=payload,
    )


def promote_skill_proposal(
    project_root: Path | str,
    proposal_id: str,
    *,
    promoted_by: str = "skill:evolve",
) -> SkillPromotionResult:
    root = Path(project_root)
    hall = HallOfRecords(root)
    proposal = hall.get_skill_proposal(proposal_id)
    if proposal is None:
        return SkillPromotionResult(
            status="FAILURE",
            proposal_id=proposal_id,
            proposal_status="MISSING",
            skill_id="",
            validation_id="",
            contract_path="",
            promotion_outcome="PROMOTION_BLOCKED",
            summary=f"Unknown skill proposal '{proposal_id}'.",
        )
    if proposal.status == "PROMOTED":
        return SkillPromotionResult(
            status="SUCCESS",
            proposal_id=proposal.proposal_id,
            proposal_status=proposal.status,
            skill_id=proposal.skill_id,
            validation_id=proposal.validation_id or "",
            contract_path=proposal.contract_path or "",
            promotion_outcome="PROMOTED",
            summary="Skill proposal already promoted.",
            bead_id=proposal.bead_id,
            resolved=True,
        )

    if not proposal.validation_id:
        return SkillPromotionResult(
            status="FAILURE",
            proposal_id=proposal.proposal_id,
            proposal_status=proposal.status,
            skill_id=proposal.skill_id,
            validation_id="",
            contract_path=proposal.contract_path or "",
            promotion_outcome="PROMOTION_BLOCKED",
            summary="Skill proposal lacks linked validation evidence.",
            bead_id=proposal.bead_id,
        )
    validation_run = hall.get_validation_run(proposal.validation_id)
    if validation_run is None:
        return SkillPromotionResult(
            status="FAILURE",
            proposal_id=proposal.proposal_id,
            proposal_status=proposal.status,
            skill_id=proposal.skill_id,
            validation_id=proposal.validation_id,
            contract_path=proposal.contract_path or "",
            promotion_outcome="PROMOTION_BLOCKED",
            summary="Linked validation record is missing from the Hall.",
            bead_id=proposal.bead_id,
        )
    if validation_run.verdict != "ACCEPTED" or validation_run.sprt_verdict != "ACCEPTED":
        return SkillPromotionResult(
            status="FAILURE",
            proposal_id=proposal.proposal_id,
            proposal_status=proposal.status,
            skill_id=proposal.skill_id,
            validation_id=proposal.validation_id,
            contract_path=proposal.contract_path or "",
            promotion_outcome="PROMOTION_BLOCKED",
            summary="Skill promotion requires accepted validation and SPRT evidence.",
            bead_id=proposal.bead_id,
            metadata={
                "validation_verdict": validation_run.verdict,
                "sprt_verdict": validation_run.sprt_verdict,
            },
        )

    if not proposal.proposal_path or not proposal.contract_path:
        return SkillPromotionResult(
            status="FAILURE",
            proposal_id=proposal.proposal_id,
            proposal_status=proposal.status,
            skill_id=proposal.skill_id,
            validation_id=proposal.validation_id,
            contract_path=proposal.contract_path or "",
            promotion_outcome="PROMOTION_BLOCKED",
            summary="Skill proposal is missing its materialized contract paths.",
            bead_id=proposal.bead_id,
        )

    proposal_artifact_path = root / proposal.proposal_path
    artifact = _read_json(proposal_artifact_path)
    proposed_contract = artifact.get("proposed_contract")
    if not isinstance(proposed_contract, dict):
        return SkillPromotionResult(
            status="FAILURE",
            proposal_id=proposal.proposal_id,
            proposal_status=proposal.status,
            skill_id=proposal.skill_id,
            validation_id=proposal.validation_id,
            contract_path=proposal.contract_path,
            promotion_outcome="PROMOTION_BLOCKED",
            summary="Skill proposal artifact does not contain a canonical contract payload.",
            bead_id=proposal.bead_id,
        )

    contract_path = root / proposal.contract_path
    _write_json(contract_path, proposed_contract)

    now = _now_ms()
    promoted_record = HallSkillProposalRecord(
        proposal_id=proposal.proposal_id,
        repo_id=proposal.repo_id,
        skill_id=proposal.skill_id,
        status="PROMOTED",
        created_at=proposal.created_at,
        updated_at=now,
        bead_id=proposal.bead_id,
        validation_id=proposal.validation_id,
        target_path=proposal.target_path,
        contract_path=proposal.contract_path,
        proposal_path=proposal.proposal_path,
        summary=proposal.summary,
        promotion_note=f"Promoted into canonical contract with accepted validation {proposal.validation_id}.",
        promoted_at=now,
        promoted_by=promoted_by,
        metadata=dict(proposal.metadata),
    )
    hall.save_skill_proposal(promoted_record)
    hall.save_skill_observation(
        HallSkillObservation(
            observation_id=f"promote:{uuid.uuid4().hex[:12]}",
            repo_id=proposal.repo_id,
            skill_id=proposal.skill_id,
            outcome="PROMOTED",
            observation=f"Promoted skill proposal {proposal.proposal_id} into {proposal.contract_path}.",
            created_at=now,
            metadata={
                "proposal_id": proposal.proposal_id,
                "validation_id": proposal.validation_id,
                "promoted_by": promoted_by,
            },
        )
    )

    resolved = False
    if proposal.bead_id:
        ledger = BeadLedger(root)
        resolved = (
            ledger.resolve_bead(
                proposal.bead_id,
                validation_id=proposal.validation_id,
                resolution_note=f"Skill proposal {proposal.proposal_id} promoted into {proposal.contract_path}.",
            )
            is not None
        )

    return SkillPromotionResult(
        status="SUCCESS",
        proposal_id=proposal.proposal_id,
        proposal_status="PROMOTED",
        skill_id=proposal.skill_id,
        validation_id=proposal.validation_id,
        contract_path=proposal.contract_path,
        promotion_outcome="PROMOTED",
        summary=f"Promoted skill proposal {proposal.proposal_id} into {proposal.contract_path}.",
        bead_id=proposal.bead_id,
        resolved=resolved,
        metadata={"promoted_by": promoted_by},
    )
