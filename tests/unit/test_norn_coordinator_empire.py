import json

import pytest

from src.core.engine.hall_schema import HallFileRecord, HallOfRecords, HallScanRecord
from src.core.norn_coordinator import NornCoordinator


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
            baseline_gungnir_score=6.5,
            started_at=1700000000000,
            completed_at=1700000000100,
            metadata={},
        )
    )
    hall.record_file(
        HallFileRecord(
            repo_id=repo.repo_id,
            scan_id="scan-1",
            path="src/core/alpha.py",
            gungnir_score=3.2,
            created_at=1700000000200,
        )
    )
    hall.record_file(
        HallFileRecord(
            repo_id=repo.repo_id,
            scan_id="scan-1",
            path="src/core/gamma.py",
            gungnir_score=7.4,
            created_at=1700000000300,
        )
    )


@pytest.fixture
def coordinator(tmp_path):
    seed_hall(tmp_path)

    coord = NornCoordinator(tmp_path)
    coord.ledger.upsert_bead(
        target_path="src/core/alpha.py",
        rationale="Task Alpha: Build the shield",
        contract_refs=["contracts:alpha"],
        acceptance_criteria="Raise the baseline above 6.0.",
    )
    coord.ledger.upsert_bead(
        target_path="src/core/gamma.py",
        rationale="Task Gamma: Secure the vault",
        contract_refs=["contracts:gamma"],
        acceptance_criteria="Raise the baseline above 8.0.",
    )
    return coord


def test_sync_tasks_projects_sovereign_bead_system(coordinator):
    """[Omega] Sync regenerates `tasks.qmd` from Hall-backed bead records."""
    active = coordinator.sync_tasks()
    assert active == 2

    content = coordinator.tasks_file.read_text(encoding="utf-8")
    assert "# Sovereign Bead System" in content
    assert "Task Alpha: Build the shield" in content
    assert "Task Gamma: Secure the vault" in content


def test_get_next_bead_claims_lowest_baseline_bead(coordinator):
    """[Omega] Claim order is based on structured bead scores, not markdown order."""
    coordinator.sync_tasks()

    bead = coordinator.get_next_bead("RAVEN-1")
    assert bead is not None
    assert bead["description"] == "Task Alpha: Build the shield"
    assert bead["scan_id"] == "scan-1"
    assert bead["baseline_scores"]["overall"] == pytest.approx(3.2)

    with coordinator._get_conn() as conn:
        row = conn.execute(
            "SELECT status, assigned_agent FROM hall_beads WHERE bead_id = ?",
            (bead["id"],),
        ).fetchone()
        assert row["status"] == "IN_PROGRESS"
        assert row["assigned_agent"] == "RAVEN-1"


def test_resolve_bead_updates_hall_and_projection(coordinator):
    """[Omega] Completing a bead moves it into review and updates the projected `tasks.qmd` view."""
    coordinator.sync_tasks()
    bead = coordinator.get_next_bead("RAVEN-1")
    assert bead is not None

    coordinator.complete_bead_work(bead["id"], "Implementation complete; awaiting validation.")

    with coordinator._get_conn() as conn:
        row = conn.execute(
            "SELECT status FROM hall_beads WHERE bead_id = ?",
            (bead["id"],),
        ).fetchone()
        assert row["status"] == "READY_FOR_REVIEW"

    content = coordinator.tasks_file.read_text(encoding="utf-8")
    assert f"- [>] [{bead['id']}]" in content
    assert "Task Gamma: Secure the vault" in content
