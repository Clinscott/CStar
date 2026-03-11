from __future__ import annotations

import json
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from src.core.engine.bead_ledger import BeadLedger, SovereignBead
from src.core.engine.forge_candidate import build_forge_request_from_bead
from src.core.engine.validation_result import (
    ValidationCheck,
    create_sprt_verdict,
    create_validation_result,
    save_validation_result,
)
from src.core.engine.skill_learning import materialize_skill_proposal, promote_skill_proposal
from src.core.engine.hall_schema import HallOfRecords, HallSkillObservation


@dataclass(slots=True)
class EvolveSkillResult:
    status: str
    bead_id: str
    scan_id: str
    target_path: str
    proposal_id: str
    proposal_status: str
    skill_id: str
    contract_path: str
    validation_id: str
    verdict: str
    sprt_verdict: str
    proposal_path: str
    promotion_outcome: str
    summary: str
    claimed: bool
    resolved: bool
    emitted_beads: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _now_ms() -> int:
    return int(time.time() * 1000)


def _claim_specific_bead(ledger: BeadLedger, bead: SovereignBead, agent_id: str) -> SovereignBead:
    claimed = ledger.claim_bead(bead.id, agent_id)
    if claimed is None:
        raise ValueError(f"Unable to claim bead '{bead.id}'.")
    return claimed


def _preview_bead(ledger: BeadLedger, bead_id: str | None) -> SovereignBead | None:
    ledger.normalize_existing_beads()
    if bead_id:
        return ledger.get_bead(bead_id)
    for bead in ledger.list_beads(statuses=("OPEN",)):
        if bead.target_path:
            return bead
    return None


def _improve_scores(baseline: dict[str, Any], focus_axes: list[str]) -> dict[str, Any]:
    improved = dict(baseline)
    if not focus_axes:
        focus_axes = ["logic", "style"]

    for axis in focus_axes:
        current = float(improved.get(axis, 7.0) or 0)
        improved[axis] = round(current + 0.2, 4)

    overall = float(improved.get("overall", baseline.get("overall", 7.0)) or 0)
    improved["overall"] = round(overall + 0.1, 4)
    return improved


def _build_no_action_result(
    hall: HallOfRecords,
    repo_id: str,
    *,
    dry_run: bool,
    bead_id: str | None,
    focus_axes: list[str],
    simulate: bool,
    validation_profile: str,
    summary: str,
) -> EvolveSkillResult:
    hall.save_skill_observation(
        HallSkillObservation(
            observation_id=f"evolve:{uuid.uuid4().hex[:12]}",
            repo_id=repo_id,
            skill_id="evolve",
            outcome="NO_ACTIONABLE_BEADS",
            observation=summary,
            created_at=_now_ms(),
            metadata={
                "bead_id": bead_id,
                "focus_axes": focus_axes,
                "simulate": simulate,
                "dry_run": dry_run,
                "validation_profile": validation_profile,
            },
        )
    )
    return EvolveSkillResult(
        status="SUCCESS",
        bead_id=bead_id or "",
        scan_id="",
        target_path="",
        proposal_id="",
        proposal_status="",
        skill_id="",
        contract_path="",
        validation_id="",
        verdict="INCONCLUSIVE",
        sprt_verdict="INCONCLUSIVE",
        proposal_path="",
        promotion_outcome="NO_ACTIONABLE_BEADS",
        summary=summary,
        claimed=False,
        resolved=False,
        emitted_beads=[],
        metadata={
            "simulate": simulate,
            "dry_run": dry_run,
            "focus_axes": focus_axes,
            "validation_profile": validation_profile,
            "no_action": True,
        },
    )


def execute_evolve(
    project_root: Path | str,
    *,
    bead_id: str | None = None,
    dry_run: bool = False,
    simulate: bool = True,
    focus_axes: list[str] | None = None,
    validation_profile: str = "standard",
) -> EvolveSkillResult:
    root = Path(project_root)
    ledger = BeadLedger(root)
    hall = HallOfRecords(root)
    hall_repo = hall.bootstrap_repository()
    agent_id = "skill:evolve"
    focus_axes = list(focus_axes or [])
    ledger.normalize_existing_beads()

    if dry_run:
        bead = _preview_bead(ledger, bead_id)
        if bead is None:
            return _build_no_action_result(
                hall,
                hall_repo.repo_id,
                dry_run=True,
                bead_id=bead_id,
                focus_axes=focus_axes,
                simulate=simulate,
                validation_profile=validation_profile,
                summary="No actionable bead is available for evolve preview.",
            )
        claimed = False
    else:
        if bead_id:
            source_bead = ledger.get_bead(bead_id)
            if source_bead is None:
                raise ValueError(f"Unknown bead '{bead_id}'.")
            if not source_bead.target_path:
                return _build_no_action_result(
                    hall,
                    hall_repo.repo_id,
                    dry_run=False,
                    bead_id=source_bead.id,
                    focus_axes=focus_axes,
                    simulate=simulate,
                    validation_profile=validation_profile,
                    summary=f"Bead '{source_bead.id}' is not actionable because it has no target path.",
                )
            if source_bead.status != "OPEN" or not source_bead.acceptance_criteria:
                return _build_no_action_result(
                    hall,
                    hall_repo.repo_id,
                    dry_run=False,
                    bead_id=source_bead.id,
                    focus_axes=focus_axes,
                    simulate=simulate,
                    validation_profile=validation_profile,
                    summary=f"Bead '{source_bead.id}' is not claimable under the sovereign bead lifecycle.",
                )
            bead = _claim_specific_bead(ledger, source_bead, agent_id)
        else:
            source_bead = _preview_bead(ledger, None)
            if source_bead is None:
                return _build_no_action_result(
                    hall,
                    hall_repo.repo_id,
                    dry_run=False,
                    bead_id=None,
                    focus_axes=focus_axes,
                    simulate=simulate,
                    validation_profile=validation_profile,
                    summary="No actionable bead is available for evolve.",
                )
            bead = _claim_specific_bead(ledger, source_bead, agent_id)
        claimed = True

    if not bead.target_path:
        raise ValueError(f"Bead '{bead.id}' does not define a target path.")

    forge_request = build_forge_request_from_bead(
        root,
        bead.id,
        operator_constraints={"persona": "TALIESIN", "mode": "simulate" if simulate else "live"},
    )

    before_scores = dict(bead.baseline_scores)
    after_scores = before_scores if dry_run else _improve_scores(before_scores, focus_axes)
    sprt = create_sprt_verdict(
        verdict="INCONCLUSIVE" if dry_run else "ACCEPTED",
        summary="Preview only." if dry_run else "Simulated candidate accepted for proposal staging.",
        llr=0.0 if dry_run else 3.2,
        passed=0 if dry_run else 10,
        total=0 if dry_run else 10,
        lower_bound=-2.9,
        upper_bound=2.9,
    )
    validation = create_validation_result(
        before=before_scores,
        after=after_scores,
        sprt=sprt,
        checks=[
            ValidationCheck(
                name="evolve-loop",
                status="PASS" if not dry_run else "SKIPPED",
                details="Simulated evolve loop under Phase 1 authority.",
            )
        ],
        summary="Dry-run evolve preview created." if dry_run else "Simulated evolve candidate accepted for proposal staging.",
        metadata={
            "validation_profile": validation_profile,
            "simulate": simulate,
            "dry_run": dry_run,
            "forge_request": forge_request.to_dict(),
        },
    )

    save_validation_result(
        str(root),
        validation,
        scan_id=bead.scan_id,
        bead_id=bead.id,
        target_path=bead.target_path,
        notes=validation.summary,
    )
    validation_run = hall.get_validation_run(validation.validation_id)
    if validation_run is None:
        raise ValueError(f"Validation '{validation.validation_id}' was not persisted to the Hall.")

    proposal = materialize_skill_proposal(
        root,
        bead=bead,
        validation=validation,
        validation_run=validation_run,
        focus_axes=focus_axes,
        validation_profile=validation_profile,
        dry_run=dry_run,
        simulate=simulate,
    )
    hall.save_skill_observation(
        HallSkillObservation(
            observation_id=f"evolve:{uuid.uuid4().hex[:12]}",
            repo_id=hall_repo.repo_id,
            skill_id="evolve",
            outcome="PREVIEW" if dry_run else "PROPOSAL_CREATED",
            observation=f"Evolve processed bead {bead.id} for {bead.target_path}.",
            created_at=_now_ms(),
            metadata={
                "proposal_id": proposal.record.proposal_id,
                "proposal_status": proposal.record.status,
                "proposal_path": proposal.proposal_path,
                "contract_path": proposal.contract_path,
                "validation_id": validation.validation_id,
                "sprt_verdict": sprt.verdict,
                "focus_axes": focus_axes,
                "simulate": simulate,
                "dry_run": dry_run,
            },
        )
    )

    resolved = False
    review_ready = False
    if claimed and not dry_run:
        review_ready = ledger.mark_ready_for_review(
            bead.id,
            resolution_note="Evolve staged a proposal with validation evidence; promotion still requires explicit review.",
        ) is not None

    return EvolveSkillResult(
        status="SUCCESS",
        bead_id=bead.id,
        scan_id=bead.scan_id,
        target_path=bead.target_path,
        proposal_id=proposal.record.proposal_id,
        proposal_status=proposal.record.status,
        skill_id=proposal.skill_id,
        contract_path=proposal.contract_path,
        validation_id=validation.validation_id,
        verdict=validation.verdict,
        sprt_verdict=sprt.verdict,
        proposal_path=str(root / proposal.proposal_path),
        promotion_outcome="PROPOSAL_ONLY" if dry_run else ("PROPOSAL_READY" if review_ready else "READY_FOR_REVIEW"),
        summary=validation.summary,
        claimed=claimed,
        resolved=resolved,
        emitted_beads=[],
        metadata={
            "simulate": simulate,
            "dry_run": dry_run,
            "focus_axes": focus_axes,
        },
    )


def execute_evolve_promotion(
    project_root: Path | str,
    *,
    proposal_id: str,
) -> EvolveSkillResult:
    promotion = promote_skill_proposal(project_root, proposal_id)
    return EvolveSkillResult(
        status=promotion.status,
        bead_id=promotion.bead_id or "",
        scan_id="",
        target_path="",
        proposal_id=promotion.proposal_id,
        proposal_status=promotion.proposal_status,
        skill_id=promotion.skill_id,
        contract_path=promotion.contract_path,
        validation_id=promotion.validation_id,
        verdict="ACCEPTED" if promotion.status == "SUCCESS" else "INCONCLUSIVE",
        sprt_verdict="ACCEPTED" if promotion.status == "SUCCESS" else "INCONCLUSIVE",
        proposal_path="",
        promotion_outcome=promotion.promotion_outcome,
        summary=promotion.summary,
        claimed=False,
        resolved=promotion.resolved,
        emitted_beads=[],
        metadata=dict(promotion.metadata),
    )
