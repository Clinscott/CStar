import json
from pathlib import Path
from unittest.mock import MagicMock

from src.core.engine.bead_ledger import BeadLedger
from src.core.engine.hall_schema import HallFileRecord, HallOfRecords, HallScanRecord, HallValidationRun
from src.core.engine.ravens_stage import RavensHallReferenceSet, RavensStageResult, RavensTargetIdentity
from src.core.engine.ravens.muninn_memory import MuninnMemory
from src.core.engine.ravens.muninn_promotion import MuninnPromotion


def seed_claimed_bead(root: Path) -> tuple[MuninnMemory, BeadLedger, str, str, Path]:
    agents_dir = root / ".agents"
    agents_dir.mkdir(parents=True, exist_ok=True)
    (agents_dir / "sovereign_state.json").write_text(json.dumps({}), encoding="utf-8")

    target_file = root / "src" / "promote_target.py"
    target_file.parent.mkdir(parents=True, exist_ok=True)
    target_file.write_text("print('original')\n", encoding="utf-8")

    hall = HallOfRecords(root)
    repo = hall.bootstrap_repository()
    hall.record_scan(
        HallScanRecord(
            scan_id="scan-promote-1",
            repo_id=repo.repo_id,
            scan_kind="promotion_test",
            status="COMPLETED",
            baseline_gungnir_score=1.0,
            started_at=1700000000000,
            completed_at=1700000000100,
            metadata={},
        )
    )
    hall.record_file(
        HallFileRecord(
            repo_id=repo.repo_id,
            scan_id="scan-promote-1",
            path="src/promote_target.py",
            gungnir_score=1.0,
            matrix={"overall": 1.0},
            created_at=1700000000200,
        )
    )

    ledger = BeadLedger(root)
    bead = ledger.upsert_bead(
        scan_id="scan-promote-1",
        target_path="src/promote_target.py",
        rationale="Promote the validated candidate.",
        contract_refs=["contracts:promote-target"],
        acceptance_criteria="Resolve only with canonical validation evidence.",
    )
    claimed = ledger.claim_bead(bead.id, "MUNINN")
    assert claimed is not None
    memory = MuninnMemory(root)
    return memory, ledger, repo.repo_id, bead.id, target_file


def build_validation_stage(
    *,
    repo_id: str,
    bead_id: str,
    validation_id: str,
    status: str,
    summary: str,
) -> RavensStageResult:
    return RavensStageResult(
        stage="validate",
        status=status,
        summary=summary,
        target=RavensTargetIdentity(
            target_kind="FILE",
            target_path="src/promote_target.py",
            bead_id=bead_id,
            rationale="Promote the validated candidate.",
            acceptance_criteria="Resolve only with canonical validation evidence.",
            baseline_scores={"overall": 1.0},
            compatibility_source="hall_beads",
        ),
        hall=RavensHallReferenceSet(
            repo_id=repo_id,
            validation_id=validation_id,
            bead_id=bead_id,
        ),
        metadata={
            "candidate_applied": True,
            "mission_id": bead_id,
            "validation_verdict": "ACCEPTED" if status == "SUCCESS" else "REJECTED",
            "validation_blocking_reasons": [] if status == "SUCCESS" else ["Crucible rejected the candidate."],
            "score_delta": {"delta": {"overall": 1.5}},
        },
    )


def test_execute_promotion_stage_resolves_validated_bead(tmp_path: Path) -> None:
    memory, ledger, repo_id, bead_id, target_file = seed_claimed_bead(tmp_path)
    validation_id = "validation:promote-success"

    target_file.write_text("print('fixed')\n", encoding="utf-8")
    Path(str(target_file) + ".bak").write_text("print('original')\n", encoding="utf-8")

    HallOfRecords(tmp_path).save_validation_run(
        HallValidationRun(
            validation_id=validation_id,
            repo_id=repo_id,
            scan_id="scan-promote-1",
            bead_id=bead_id,
            target_path="src/promote_target.py",
            verdict="ACCEPTED",
            created_at=1700000000300,
            pre_scores={"overall": 1.0},
            post_scores={"overall": 2.5},
            notes="Promotion candidate accepted.",
        )
    )

    promotion = MuninnPromotion(tmp_path)
    stage = build_validation_stage(
        repo_id=repo_id,
        bead_id=bead_id,
        validation_id=validation_id,
        status="SUCCESS",
        summary="Crucible accepted the candidate.",
    )

    result = promotion.execute_promotion_stage(
        repo_id,
        stage,
        memory.record_stage_observation,
        memory.record_trace,
    )

    assert result.status == "SUCCESS"
    assert result.hall is not None
    assert result.hall.validation_id == validation_id
    assert not Path(str(target_file) + ".bak").exists()
    assert target_file.read_text(encoding="utf-8") == "print('fixed')\n"

    bead = ledger.get_bead(bead_id)
    assert bead is not None
    assert bead.status == "RESOLVED"
    assert bead.resolved_validation_id == validation_id

    with HallOfRecords(tmp_path).connect() as conn:
        promote_count = conn.execute(
            "SELECT COUNT(*) AS count FROM hall_skill_observations WHERE skill_id = 'ravens:promote'"
        ).fetchone()["count"]
        trace_count = conn.execute(
            "SELECT COUNT(*) AS count FROM hall_skill_observations WHERE skill_id = 'ravens:trace'"
        ).fetchone()["count"]

    assert promote_count == 1
    assert trace_count == 1


def test_execute_promotion_stage_rolls_back_rejected_candidate_and_blocks_bead(tmp_path: Path) -> None:
    memory, ledger, repo_id, bead_id, target_file = seed_claimed_bead(tmp_path)
    validation_id = "validation:promote-rejected"

    target_file.write_text("print('fixed')\n", encoding="utf-8")
    Path(str(target_file) + ".bak").write_text("print('original')\n", encoding="utf-8")

    HallOfRecords(tmp_path).save_validation_run(
        HallValidationRun(
            validation_id=validation_id,
            repo_id=repo_id,
            scan_id="scan-promote-1",
            bead_id=bead_id,
            target_path="src/promote_target.py",
            verdict="REJECTED",
            created_at=1700000000300,
            pre_scores={"overall": 1.0},
            post_scores={"overall": 1.0},
            notes="Promotion candidate rejected.",
        )
    )

    promotion = MuninnPromotion(tmp_path)
    stage = build_validation_stage(
        repo_id=repo_id,
        bead_id=bead_id,
        validation_id=validation_id,
        status="FAILURE",
        summary="Crucible rejected the candidate.",
    )

    result = promotion.execute_promotion_stage(
        repo_id,
        stage,
        memory.record_stage_observation,
        memory.record_trace,
    )

    assert result.status == "FAILURE"
    assert result.metadata["rolled_back"] is True
    assert target_file.read_text(encoding="utf-8") == "print('original')\n"
    assert not Path(str(target_file) + ".bak").exists()

    bead = ledger.get_bead(bead_id)
    assert bead is not None
    assert bead.status == "BLOCKED"
    assert bead.triage_reason == "Crucible rejected the candidate."


def test_execute_promotion_stage_rolls_back_when_watcher_rejects_candidate(tmp_path: Path) -> None:
    memory, ledger, repo_id, bead_id, target_file = seed_claimed_bead(tmp_path)
    validation_id = "validation:promote-watcher"

    target_file.write_text("print('fixed')\n", encoding="utf-8")
    Path(str(target_file) + ".bak").write_text("print('original')\n", encoding="utf-8")

    HallOfRecords(tmp_path).save_validation_run(
        HallValidationRun(
            validation_id=validation_id,
            repo_id=repo_id,
            scan_id="scan-promote-1",
            bead_id=bead_id,
            target_path="src/promote_target.py",
            verdict="ACCEPTED",
            created_at=1700000000300,
            pre_scores={"overall": 1.0},
            post_scores={"overall": 2.5},
            notes="Promotion candidate accepted.",
        )
    )

    watcher = MagicMock()
    watcher.record_edit.return_value = False
    watcher.record_failure.return_value = 2

    promotion = MuninnPromotion(tmp_path, watcher=watcher)
    stage = build_validation_stage(
        repo_id=repo_id,
        bead_id=bead_id,
        validation_id=validation_id,
        status="SUCCESS",
        summary="Crucible accepted the candidate.",
    )

    result = promotion.execute_promotion_stage(
        repo_id,
        stage,
        memory.record_stage_observation,
        memory.record_trace,
    )

    assert result.status == "FAILURE"
    assert result.metadata["rolled_back"] is True
    assert target_file.read_text(encoding="utf-8") == "print('original')\n"

    bead = ledger.get_bead(bead_id)
    assert bead is not None
    assert bead.status == "BLOCKED"
    assert bead.triage_reason == "Watcher rejected the validated candidate."
    watcher.record_edit.assert_called_once()
    watcher.record_failure.assert_called_once_with("src/promote_target.py")
