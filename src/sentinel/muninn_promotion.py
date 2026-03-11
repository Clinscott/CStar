"""
[SPOKE] Muninn Promotion
Lore: "The Hand That Returns the Candidate to the Timeline."
Purpose: Own promotion side effects, rollback behavior, watcher checks, and bead lifecycle finalization.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any, Callable

from src.core.engine.ravens_stage import RavensHallReferenceSet, RavensStageResult, RavensTargetIdentity
from src.core.norn_coordinator import NornCoordinator
from src.core.sovereign_hud import SovereignHUD
from src.sentinel.stability import TheWatcher

StageObservationRecorder = Callable[[str, str, str, dict[str, Any] | None], str]
TraceRecorder = Callable[[str, str, str, float, str], str]


class MuninnPromotion:
    def __init__(self, root: Path, watcher: TheWatcher | None = None):
        self.root = root
        self.watcher = watcher or TheWatcher(root)
        self.norn = NornCoordinator(root)

    @staticmethod
    def _backup_path(file_path: Path) -> Path:
        return Path(str(file_path) + ".bak")

    def _rollback_file(self, file_path: Path) -> bool:
        backup_path = self._backup_path(file_path)
        if not backup_path.exists():
            return False
        SovereignHUD.persona_log("INFO", f"Rolling back changes for {file_path.name}...")
        shutil.copy(backup_path, file_path)
        backup_path.unlink()
        return True

    def _clear_backup(self, file_path: Path) -> None:
        backup_path = self._backup_path(file_path)
        if backup_path.exists():
            backup_path.unlink()

    @staticmethod
    def _score_delta(validation_stage: RavensStageResult) -> float:
        score_delta = validation_stage.metadata.get("score_delta")
        if isinstance(score_delta, dict):
            delta = score_delta.get("delta")
            if isinstance(delta, dict):
                try:
                    return float(delta.get("overall", 0.0) or 0.0)
                except (TypeError, ValueError):
                    return 0.0
        return 0.0

    @staticmethod
    def _string_ref(value: object) -> str | None:
        if value in (None, ""):
            return None
        return str(value)

    @staticmethod
    def _mission_id(target: RavensTargetIdentity, validation_stage: RavensStageResult) -> str:
        mission_id = validation_stage.metadata.get("mission_id")
        if isinstance(mission_id, str) and mission_id:
            return mission_id
        if target.bead_id:
            return target.bead_id
        if target.target_path:
            return f"mission:{target.target_path}"
        return "mission:ravens-promote"

    def _block_bead(self, bead_id: str | None, triage_reason: str, resolution_note: str) -> str | None:
        if not bead_id:
            return None
        blocked = self.norn.block_bead(bead_id, triage_reason, resolution_note=resolution_note)
        return blocked.status if blocked is not None else None

    def _build_failure_result(
        self,
        *,
        repo_id: str,
        target: RavensTargetIdentity,
        validation_stage: RavensStageResult,
        summary: str,
        record_observation: StageObservationRecorder,
        record_trace: TraceRecorder,
        bead_status: str | None,
        rolled_back: bool,
        watcher_accepted: bool | None,
        failure_count: int | None = None,
    ) -> RavensStageResult:
        validation_id = validation_stage.hall.validation_id if validation_stage.hall else None
        trace_observation_id = self._string_ref(
            record_trace(
                self._mission_id(target, validation_stage),
                target.target_path or target.target_ref or "unscoped",
                "promote",
                self._score_delta(validation_stage),
                "FAILED",
            )
        )
        observation_id = record_observation(
            "promote",
            "FAILURE",
            summary,
            {
                "target_path": target.target_path,
                "validation_id": validation_id,
                "bead_status": bead_status,
                "rolled_back": rolled_back,
                "watcher_accepted": watcher_accepted,
                "failure_count": failure_count,
                "trace_observation_id": trace_observation_id,
                "validation_blocking_reasons": list(validation_stage.metadata.get("validation_blocking_reasons") or []),
            },
        )
        return RavensStageResult(
            stage="promote",
            status="FAILURE",
            summary=summary,
            target=target,
            hall=RavensHallReferenceSet(
                repo_id=repo_id,
                observation_id=observation_id,
                validation_id=validation_id,
                bead_id=target.bead_id,
            ),
            metadata={
                "candidate_applied": bool(validation_stage.metadata.get("candidate_applied")),
                "bead_status": bead_status,
                "rolled_back": rolled_back,
                "watcher_accepted": watcher_accepted,
                "failure_count": failure_count,
                "trace_observation_id": trace_observation_id,
                "validation_id": validation_id,
            },
        )

    def execute_promotion_stage(
        self,
        repo_id: str,
        validation_stage: RavensStageResult,
        record_observation: StageObservationRecorder,
        record_trace: TraceRecorder,
    ) -> RavensStageResult:
        target = validation_stage.target
        if target is None:
            observation_id = record_observation(
                "promote",
                "FAILURE",
                "Promotion stage missing canonical target identity.",
                None,
            )
            return RavensStageResult(
                stage="promote",
                status="FAILURE",
                summary="Promotion stage missing canonical target identity.",
                hall=RavensHallReferenceSet(repo_id=repo_id, observation_id=observation_id),
                metadata={"candidate_applied": bool(validation_stage.metadata.get("candidate_applied"))},
            )

        target_path = target.target_path
        if not target_path:
            bead_status = self._block_bead(
                target.bead_id,
                "Promotion stage missing canonical target path.",
                "Autonomous promotion halted without a canonical target path.",
            )
            return self._build_failure_result(
                repo_id=repo_id,
                target=target,
                validation_stage=validation_stage,
                summary="Promotion stage missing canonical target path.",
                record_observation=record_observation,
                record_trace=record_trace,
                bead_status=bead_status,
                rolled_back=False,
                watcher_accepted=None,
            )

        file_path = self.root / target_path
        validation_id = validation_stage.hall.validation_id if validation_stage.hall else None
        candidate_applied = bool(validation_stage.metadata.get("candidate_applied"))

        if not candidate_applied:
            bead_status = self._block_bead(
                target.bead_id,
                validation_stage.summary,
                "Autonomous promotion blocked before candidate application completed.",
            )
            return self._build_failure_result(
                repo_id=repo_id,
                target=target,
                validation_stage=validation_stage,
                summary=validation_stage.summary,
                record_observation=record_observation,
                record_trace=record_trace,
                bead_status=bead_status,
                rolled_back=False,
                watcher_accepted=None,
            )

        if validation_stage.status != "SUCCESS":
            rolled_back = self._rollback_file(file_path)
            failure_count = self.watcher.record_failure(target_path)
            bead_status = self._block_bead(
                target.bead_id,
                validation_stage.summary,
                "Validation rejected the autonomous candidate. Review is required before retry.",
            )
            summary = f"Mission Failed: {target_path} rolled back after validation rejection."
            SovereignHUD.persona_log("FAIL", summary)
            return self._build_failure_result(
                repo_id=repo_id,
                target=target,
                validation_stage=validation_stage,
                summary=summary,
                record_observation=record_observation,
                record_trace=record_trace,
                bead_status=bead_status,
                rolled_back=rolled_back,
                watcher_accepted=None,
                failure_count=failure_count,
            )

        if not file_path.exists():
            bead_status = self._block_bead(
                target.bead_id,
                f"Validated target path disappeared before promotion: {target_path}",
                "Promotion failed because the validated target path was missing.",
            )
            return self._build_failure_result(
                repo_id=repo_id,
                target=target,
                validation_stage=validation_stage,
                summary=f"Promotion target missing after validation: {target_path}",
                record_observation=record_observation,
                record_trace=record_trace,
                bead_status=bead_status,
                rolled_back=False,
                watcher_accepted=False,
            )

        if not validation_id and target.bead_id:
            rolled_back = self._rollback_file(file_path)
            failure_count = self.watcher.record_failure(target_path)
            bead_status = self._block_bead(
                target.bead_id,
                "Promotion lacked canonical validation evidence.",
                "Validated candidate could not be promoted because the validation id was missing.",
            )
            return self._build_failure_result(
                repo_id=repo_id,
                target=target,
                validation_stage=validation_stage,
                summary=f"Mission Failed: {target_path} rolled back because validation evidence was missing.",
                record_observation=record_observation,
                record_trace=record_trace,
                bead_status=bead_status,
                rolled_back=rolled_back,
                watcher_accepted=False,
                failure_count=failure_count,
            )

        if not self.watcher.record_edit(target_path, file_path.read_text(encoding="utf-8")):
            rolled_back = self._rollback_file(file_path)
            failure_count = self.watcher.record_failure(target_path)
            bead_status = self._block_bead(
                target.bead_id,
                "Watcher rejected the validated candidate.",
                "Validated candidate triggered watcher rejection and was rolled back for review.",
            )
            summary = f"Mission Failed: {target_path} rolled back after watcher rejection."
            SovereignHUD.persona_log("FAIL", summary)
            return self._build_failure_result(
                repo_id=repo_id,
                target=target,
                validation_stage=validation_stage,
                summary=summary,
                record_observation=record_observation,
                record_trace=record_trace,
                bead_status=bead_status,
                rolled_back=rolled_back,
                watcher_accepted=False,
                failure_count=failure_count,
            )

        resolved = self.norn.finalize_bead(
            target.bead_id,
            validation_id=validation_id,
            resolution_note=f"Validated promotion accepted for {target_path}.",
        ) if target.bead_id else None

        if target.bead_id and resolved is None:
            rolled_back = self._rollback_file(file_path)
            failure_count = self.watcher.record_failure(target_path)
            bead_status = self._block_bead(
                target.bead_id,
                "Canonical bead finalization failed after validation.",
                "Validated candidate was rolled back because bead resolution could not be recorded canonically.",
            )
            return self._build_failure_result(
                repo_id=repo_id,
                target=target,
                validation_stage=validation_stage,
                summary=f"Mission Failed: {target_path} rolled back because bead finalization failed.",
                record_observation=record_observation,
                record_trace=record_trace,
                bead_status=bead_status,
                rolled_back=rolled_back,
                watcher_accepted=False,
                failure_count=failure_count,
            )

        self._clear_backup(file_path)
        summary = f"Mission Accomplished: {target_path} sanitized."
        SovereignHUD.persona_log("SUCCESS", summary)
        trace_observation_id = self._string_ref(
            record_trace(
                self._mission_id(target, validation_stage),
                target_path,
                "promote",
                self._score_delta(validation_stage),
                "SUCCESS",
            )
        )
        observation_id = record_observation(
            "promote",
            "SUCCESS",
            summary,
            {
                "target_path": target_path,
                "validation_id": validation_id,
                "bead_status": resolved.status if resolved is not None else None,
                "trace_observation_id": trace_observation_id,
                "watcher_accepted": True,
            },
        )
        return RavensStageResult(
            stage="promote",
            status="SUCCESS",
            summary=summary,
            target=target,
            hall=RavensHallReferenceSet(
                repo_id=repo_id,
                observation_id=observation_id,
                validation_id=validation_id,
                bead_id=target.bead_id,
            ),
            metadata={
                "candidate_applied": True,
                "bead_status": resolved.status if resolved is not None else None,
                "trace_observation_id": trace_observation_id,
                "validation_id": validation_id,
                "watcher_accepted": True,
            },
        )
