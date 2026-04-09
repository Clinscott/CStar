import json
import threading

from src.core.engine.bead_ledger import BeadLedger
from src.core.engine.hall_schema import HallBeadRecord, HallFileRecord, HallOfRecords, HallScanRecord, HallValidationRun


def seed_hall(root):
    agents_dir = root / ".agents"
    agents_dir.mkdir()
    (agents_dir / "sovereign_state.json").write_text(json.dumps({}), encoding="utf-8")

    hall = HallOfRecords(root)
    repo = hall.bootstrap_repository()
    hall.record_scan(
        HallScanRecord(
            scan_id="scan-1",
            repo_id=repo.repo_id,
            scan_kind="baseline",
            status="COMPLETED",
            baseline_gungnir_score=5.8,
            started_at=1700000000000,
            completed_at=1700000000100,
            metadata={},
        )
    )
    hall.record_file(
        HallFileRecord(
            repo_id=repo.repo_id,
            scan_id="scan-1",
            path="src/core/sample.py",
            gungnir_score=2.7,
            created_at=1700000000200,
        )
    )


def test_bead_ledger_projects_and_detects_projection_drift(tmp_path):
    seed_hall(tmp_path)
    ledger = BeadLedger(tmp_path)

    bead = ledger.upsert_bead(
        target_path="src/core/sample.py",
        rationale="Repair the sample path",
        contract_refs=["contracts:sample-repair"],
        acceptance_criteria="Raise the baseline above 5.0.",
    )

    assert bead.scan_id == "scan-1"
    assert bead.baseline_scores["overall"] == 2.7

    active = ledger.sync_tasks_projection()
    assert active == 1
    assert ledger.projection_matches() is True

    content = (tmp_path / "tasks.qmd").read_text(encoding="utf-8")
    assert f"[{bead.id}]" in content

    (tmp_path / "tasks.qmd").write_text("drift\n", encoding="utf-8")
    assert ledger.projection_matches() is False


def test_bead_ledger_allows_distinct_same_file_work_but_dedupes_exact_duplicates(tmp_path):
    seed_hall(tmp_path)
    ledger = BeadLedger(tmp_path)

    logic = ledger.upsert_bead(
        target_path="src/core/sample.py",
        rationale="Improve logic in the sample path",
        contract_refs=["contract:logic"],
        acceptance_criteria="Raise logic above 5.0.",
    )
    style = ledger.upsert_bead(
        target_path="src/core/sample.py",
        rationale="Improve style in the sample path",
        contract_refs=["contract:style"],
        acceptance_criteria="Raise style above 5.0.",
    )
    duplicate = ledger.upsert_bead(
        target_path="src/core/sample.py",
        rationale="Improve logic in the sample path",
        contract_refs=["contract:logic"],
        acceptance_criteria="Raise logic above 5.0.",
    )

    assert logic.id != style.id
    assert duplicate.id == logic.id
    assert len(ledger.list_beads()) == 2


def test_bead_ledger_blocks_non_actionable_active_beads(tmp_path):
    seed_hall(tmp_path)
    hall = HallOfRecords(tmp_path)
    repo = hall.bootstrap_repository()
    hall.upsert_bead(
        HallBeadRecord(
            bead_id="legacy-bead:test",
            repo_id=repo.repo_id,
            scan_id="scan-1",
            rationale="Legacy repo-wide task without a target path",
            created_at=1700000000400,
            updated_at=1700000000400,
            status="OPEN",
        )
    )

    ledger = BeadLedger(tmp_path)
    beads = ledger.list_beads()
    triaged = next(bead for bead in beads if bead.id == "legacy-bead:test")

    assert triaged.status == "NEEDS_TRIAGE"
    assert triaged.triage_reason in {
        "Missing canonical target identity.",
        "Missing acceptance criteria.",
    }
    assert triaged.to_public_dict()["actionable"] is False
    assert ledger.peek_next_bead() is None

    ledger.sync_tasks_projection()
    content = (tmp_path / "tasks.qmd").read_text(encoding="utf-8")
    assert "## Beads Requiring Triage" in content
    assert "[legacy-bead:test]" in content
    assert "triage:" in content


def test_bead_ledger_triages_contractless_or_synthetic_contract_beads(tmp_path):
    seed_hall(tmp_path)
    ledger = BeadLedger(tmp_path)

    bead = ledger.upsert_bead(
        target_path="src/core/sample.py",
        rationale="Repair the sample path",
        contract_refs=["workflow:/run-task"],
        acceptance_criteria="Raise the baseline above 5.0.",
    )

    assert bead.status == "NEEDS_TRIAGE"
    assert bead.triage_reason == "Missing canonical contract references."
    assert bead.to_public_dict()["actionable"] is False
    assert ledger.peek_next_bead() is None


def test_claim_next_bead_is_atomic_under_concurrent_agents(tmp_path):
    seed_hall(tmp_path)
    ledger = BeadLedger(tmp_path)
    bead = ledger.upsert_bead(
        target_path="src/core/sample.py",
        rationale="Repair the sample path",
        contract_refs=["contracts:sample-repair"],
        acceptance_criteria="Raise the baseline above 5.0.",
    )

    barrier = threading.Barrier(2)
    results: list[dict[str, object] | None] = []

    def runner(agent_id: str) -> None:
        local_ledger = BeadLedger(tmp_path)
        barrier.wait()
        results.append(local_ledger.claim_next_bead(agent_id))

    threads = [
        threading.Thread(target=runner, args=("RAVEN-A",)),
        threading.Thread(target=runner, args=("RAVEN-B",)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    claimed = [result for result in results if result is not None]
    assert len(claimed) == 1
    assert claimed[0]["id"] == bead.id

    materialized = ledger.get_bead(bead.id)
    assert materialized is not None
    assert materialized.status == "IN_PROGRESS"
    assert materialized.assigned_agent in {"RAVEN-A", "RAVEN-B"}


def test_claim_next_bead_prioritizes_set_gate_work(tmp_path):
    seed_hall(tmp_path)
    ledger = BeadLedger(tmp_path)

    draft = ledger.upsert_bead(
        bead_id="bead-open",
        target_path="src/core/sample.py",
        rationale="Draft bead still awaiting set gate",
        contract_refs=["contracts:sample-repair"],
        acceptance_criteria="Raise the baseline above 5.0.",
        status="OPEN",
    )
    approved = ledger.upsert_bead(
        bead_id="bead-set",
        target_path="src/core/sample.py",
        rationale="Approved bead ready for execution",
        contract_refs=["contracts:sample-repair"],
        acceptance_criteria="Raise the baseline above 5.0.",
        status="SET",
    )

    preview = ledger.peek_next_bead()
    claimed = ledger.claim_next_bead("RAVEN-SET")

    assert preview is not None
    assert preview["id"] == approved.id
    assert claimed is not None
    assert claimed["id"] == approved.id

    claimed_record = ledger.get_bead(approved.id)
    draft_record = ledger.get_bead(draft.id)
    assert claimed_record is not None and claimed_record.status == "IN_PROGRESS"
    assert draft_record is not None and draft_record.status == "OPEN"


def test_hall_upsert_preserves_checker_shell_on_status_updates(tmp_path):
    seed_hall(tmp_path)
    hall = HallOfRecords(tmp_path)
    repo = hall.bootstrap_repository()

    hall.upsert_bead(
        HallBeadRecord(
            bead_id="bead-preserve-checker",
            repo_id=repo.repo_id,
            target_path="src/core/sample.py",
            rationale="Repair the sample path",
            acceptance_criteria="Raise the baseline above 5.0.",
            checker_shell="python -m pytest tests/unit/test_bead_ledger.py -q",
            status="OPEN",
            created_at=1700000000200,
            updated_at=1700000000200,
        )
    )
    hall.upsert_bead(
        HallBeadRecord(
            bead_id="bead-preserve-checker",
            repo_id=repo.repo_id,
            target_path="src/core/sample.py",
            rationale="Repair the sample path",
            acceptance_criteria="Raise the baseline above 5.0.",
            status="IN_PROGRESS",
            assigned_agent="RAVEN-A",
            created_at=1700000000200,
            updated_at=1700000000201,
        )
    )

    bead = BeadLedger(tmp_path).get_bead("bead-preserve-checker")
    assert bead is not None
    assert bead.status == "IN_PROGRESS"
    assert bead.checker_shell == "python -m pytest tests/unit/test_bead_ledger.py -q"


def test_bead_ledger_requires_validation_before_resolution(tmp_path):
    seed_hall(tmp_path)
    ledger = BeadLedger(tmp_path)
    bead = ledger.upsert_bead(
        target_path="src/core/sample.py",
        rationale="Repair the sample path",
        contract_refs=["contracts:sample-repair"],
        acceptance_criteria="Raise the baseline above 5.0.",
    )

    claimed = ledger.claim_bead(bead.id, "RAVEN-1")
    assert claimed is not None
    review = ledger.mark_ready_for_review(bead.id, "Implementation complete; awaiting validation.")
    assert review is not None
    assert review.status == "READY_FOR_REVIEW"

    assert ledger.resolve_bead(bead.id) is None

    hall = HallOfRecords(tmp_path)
    hall.save_validation_run(
        HallValidationRun(
            validation_id="validation-1",
            repo_id=ledger.repository.repo_id,
            scan_id=review.scan_id,
            bead_id=review.id,
            target_path=review.target_path,
            verdict="ACCEPTED",
            created_at=1700000000500,
            pre_scores={"overall": 2.7},
            post_scores={"overall": 6.1},
            notes="Canonical validation accepted.",
        )
    )

    resolved = ledger.resolve_bead(bead.id, validation_id="validation-1", resolution_note="Accepted after review.")
    assert resolved is not None
    assert resolved.status == "RESOLVED"
    assert resolved.resolved_validation_id == "validation-1"


def test_bead_ledger_can_block_failed_autonomous_work(tmp_path):
    seed_hall(tmp_path)
    ledger = BeadLedger(tmp_path)
    bead = ledger.upsert_bead(
        target_path="src/core/sample.py",
        rationale="Repair the sample path",
        contract_refs=["contracts:sample-repair"],
        acceptance_criteria="Raise the baseline above 5.0.",
    )

    claimed = ledger.claim_bead(bead.id, "RAVEN-1")
    assert claimed is not None

    blocked = ledger.block_bead(
        bead.id,
        "Watcher rejected the validated candidate.",
        resolution_note="Autonomous promotion failed and requires review.",
    )

    assert blocked is not None
    assert blocked.status == "BLOCKED"
    assert blocked.assigned_agent is None
    assert blocked.triage_reason == "Watcher rejected the validated candidate."
    assert blocked.resolution_note == "Autonomous promotion failed and requires review."


def test_bead_ledger_backfills_diagnostic_beads_with_actionable_fields(tmp_path):
    seed_hall(tmp_path)
    hall = HallOfRecords(tmp_path)
    repo = hall.bootstrap_repository()
    hall.upsert_bead(
        HallBeadRecord(
            bead_id="bead:diag:fix:test",
            repo_id=repo.repo_id,
            scan_id="scan-1",
            target_kind="FILE",
            target_ref="Kernel",
            target_path="src/core/sample.py",
            rationale="[Diagnostic]: Kernel -> src/core/sample.py requires review. Findings: Missing explicit 1:1 unit test (Linscott Breach Risk).",
            status="NEEDS_TRIAGE",
            source_kind="LEVEL_5_DIAGNOSTIC",
            triage_reason="Missing acceptance criteria.",
            created_at=1700000000600,
            updated_at=1700000000600,
        )
    )

    ledger = BeadLedger(tmp_path)
    ledger.normalize_existing_beads()
    bead = ledger.get_bead("bead:diag:fix:test")
    assert bead is not None
    assert bead.status == "OPEN"
    assert bead.triage_reason is None
    assert bead.contract_refs == ["file:src/core/sample.py"]
    assert "focused 1:1 test" in (bead.acceptance_criteria or "")


def test_bead_ledger_archives_system_execution_telemetry(tmp_path):
    seed_hall(tmp_path)
    hall = HallOfRecords(tmp_path)
    repo = hall.bootstrap_repository()
    hall.upsert_bead(
        HallBeadRecord(
            bead_id="bead_mission_telemetry",
            repo_id=repo.repo_id,
            scan_id="scan-1",
            target_kind="WEAVE",
            target_ref="weave:orchestrate",
            rationale="Execution of weave:orchestrate under mission MISSION-12345",
            status="NEEDS_TRIAGE",
            source_kind="SYSTEM",
            triage_reason="Missing acceptance criteria.",
            created_at=1700000000700,
            updated_at=1700000000700,
        )
    )

    ledger = BeadLedger(tmp_path)
    ledger.normalize_existing_beads()
    bead = ledger.get_bead("bead_mission_telemetry")
    assert bead is not None
    assert bead.status == "ARCHIVED"
    assert bead.triage_reason is None
    assert "telemetry retained" in (bead.resolution_note or "").lower()
