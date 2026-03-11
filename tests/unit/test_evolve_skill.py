import json
from pathlib import Path

from src.core.engine.bead_ledger import BeadLedger
from src.core.engine.evolve_skill import execute_evolve, execute_evolve_promotion
from src.core.engine.hall_schema import HallFileRecord, HallOfRecords, HallScanRecord


def seed_bead(root: Path) -> str:
    agents_dir = root / ".agents"
    agents_dir.mkdir(parents=True, exist_ok=True)
    (agents_dir / "sovereign_state.json").write_text(json.dumps({}), encoding="utf-8")
    contract_dir = agents_dir / "skills" / "evolve"
    contract_dir.mkdir(parents=True, exist_ok=True)
    (contract_dir / "contract.json").write_text(
        json.dumps(
            {
                "skill_id": "evolve",
                "version": "1.0",
                "authority_root": ".agents/skills/evolve",
                "runtime_trigger": "evolve",
                "inputs": {"bead_id": "optional string"},
                "outputs": {"validation_id": "string"},
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    hall = HallOfRecords(root)
    repo = hall.bootstrap_repository()
    hall.record_scan(
        HallScanRecord(
            scan_id="scan-evolve-1",
            repo_id=repo.repo_id,
            scan_kind="evolve_test",
            status="COMPLETED",
            baseline_gungnir_score=7.4,
            started_at=1700000000000,
            completed_at=1700000000100,
            metadata={},
        )
    )
    hall.record_file(
        HallFileRecord(
            repo_id=repo.repo_id,
            scan_id="scan-evolve-1",
            path="src/evolve_target.py",
            gungnir_score=7.4,
            matrix={"logic": 7.4, "style": 7.4, "sovereignty": 7.4, "overall": 7.4},
            created_at=1700000000200,
        )
    )
    bead = BeadLedger(root).upsert_bead(
        scan_id="scan-evolve-1",
        target_path="src/evolve_target.py",
        rationale="Improve the evolve target.",
        contract_refs=["contract:evolve"],
        baseline_scores={"logic": 7.4, "style": 7.4, "sovereignty": 7.4, "overall": 7.4},
        acceptance_criteria="Raise logic without lowering sovereignty.",
    )
    return bead.id


def test_execute_evolve_records_validation_and_proposal(tmp_path: Path) -> None:
    bead_id = seed_bead(tmp_path)

    result = execute_evolve(
        tmp_path,
        bead_id=bead_id,
        simulate=True,
        focus_axes=["logic"],
    )

    assert result.status == "SUCCESS"
    assert result.verdict == "ACCEPTED"
    assert Path(result.proposal_path).exists()
    assert result.proposal_id.startswith("proposal:")
    assert result.proposal_status == "VALIDATED"
    assert result.skill_id == "evolve"
    assert result.contract_path == ".agents/skills/evolve/contract.json"
    bead = BeadLedger(tmp_path).get_bead(bead_id)
    assert bead is not None
    assert bead.status == "READY_FOR_REVIEW"
    assert bead.resolved_validation_id is None
    assert result.promotion_outcome == "PROPOSAL_READY"
    assert result.resolved is False

    with HallOfRecords(tmp_path).connect() as conn:
        validation_count = conn.execute("SELECT COUNT(*) AS count FROM hall_validation_runs").fetchone()["count"]
        observation_count = conn.execute("SELECT COUNT(*) AS count FROM hall_skill_observations WHERE skill_id = 'evolve'").fetchone()["count"]
        proposal_count = conn.execute("SELECT COUNT(*) AS count FROM hall_skill_proposals WHERE skill_id = 'evolve'").fetchone()["count"]

    assert validation_count == 1
    assert observation_count == 1
    assert proposal_count == 1


def test_execute_evolve_claims_an_actionable_bead_when_none_is_supplied(tmp_path: Path) -> None:
    bead_id = seed_bead(tmp_path)

    result = execute_evolve(
        tmp_path,
        simulate=True,
        focus_axes=["logic"],
    )

    assert result.status == "SUCCESS"
    assert result.bead_id == bead_id
    assert result.claimed is True
    assert result.promotion_outcome == "PROPOSAL_READY"
    bead = BeadLedger(tmp_path).get_bead(bead_id)
    assert bead is not None
    assert bead.status == "READY_FOR_REVIEW"


def test_execute_evolve_returns_no_action_result_when_no_actionable_bead_exists(tmp_path: Path) -> None:
    result = execute_evolve(tmp_path, dry_run=True, simulate=True)

    assert result.status == "SUCCESS"
    assert result.promotion_outcome == "NO_ACTIONABLE_BEADS"
    assert result.summary == "No actionable bead is available for evolve preview."
    assert result.claimed is False
    assert result.resolved is False

    with HallOfRecords(tmp_path).connect() as conn:
        observation = conn.execute(
            "SELECT outcome FROM hall_skill_observations WHERE skill_id = 'evolve'"
        ).fetchone()

    assert observation["outcome"] == "NO_ACTIONABLE_BEADS"


def test_execute_evolve_does_not_claim_non_actionable_explicit_bead(tmp_path: Path) -> None:
    agents_dir = tmp_path / ".agents"
    agents_dir.mkdir(parents=True, exist_ok=True)
    (agents_dir / "sovereign_state.json").write_text(json.dumps({}), encoding="utf-8")

    hall = HallOfRecords(tmp_path)
    repo = hall.bootstrap_repository()
    hall.record_scan(
        HallScanRecord(
            scan_id="scan-evolve-legacy",
            repo_id=repo.repo_id,
            scan_kind="evolve_test",
            status="COMPLETED",
            baseline_gungnir_score=5.0,
            started_at=1700000000000,
            completed_at=1700000000100,
            metadata={},
        )
    )

    bead = BeadLedger(tmp_path).upsert_bead(
        scan_id="scan-evolve-legacy",
        rationale="Legacy repo-level evolve target",
    )

    result = execute_evolve(tmp_path, bead_id=bead.id, dry_run=False, simulate=True)

    assert result.status == "SUCCESS"
    assert result.promotion_outcome == "NO_ACTIONABLE_BEADS"
    assert "not actionable" in result.summary
    assert BeadLedger(tmp_path).get_bead(bead.id).status == "NEEDS_TRIAGE"


def test_execute_evolve_promotion_requires_accepted_validation_and_resolves_bead(tmp_path: Path) -> None:
    bead_id = seed_bead(tmp_path)

    proposal = execute_evolve(
        tmp_path,
        bead_id=bead_id,
        simulate=True,
        focus_axes=["logic"],
    )
    result = execute_evolve_promotion(tmp_path, proposal_id=proposal.proposal_id)

    assert result.status == "SUCCESS"
    assert result.promotion_outcome == "PROMOTED"
    assert result.proposal_status == "PROMOTED"
    assert result.contract_path == ".agents/skills/evolve/contract.json"
    assert result.resolved is True

    contract = json.loads((tmp_path / ".agents" / "skills" / "evolve" / "contract.json").read_text(encoding="utf-8"))
    assert contract["version"] == "1.1"
    assert contract["defaults"]["focus_axes"] == ["logic"]
    assert contract["promotion_gate"]["requires_validation_verdict"] == "ACCEPTED"

    bead = BeadLedger(tmp_path).get_bead(bead_id)
    assert bead is not None
    assert bead.status == "RESOLVED"
    assert bead.resolved_validation_id == proposal.validation_id


def test_execute_evolve_promotion_blocks_unvalidated_proposals(tmp_path: Path) -> None:
    bead_id = seed_bead(tmp_path)

    proposal = execute_evolve(
        tmp_path,
        bead_id=bead_id,
        dry_run=True,
        simulate=True,
        focus_axes=["logic"],
    )
    result = execute_evolve_promotion(tmp_path, proposal_id=proposal.proposal_id)

    assert proposal.proposal_status == "PROPOSED"
    assert result.status == "FAILURE"
    assert result.promotion_outcome == "PROMOTION_BLOCKED"

    contract = json.loads((tmp_path / ".agents" / "skills" / "evolve" / "contract.json").read_text(encoding="utf-8"))
    assert contract["version"] == "1.0"
    bead = BeadLedger(tmp_path).get_bead(bead_id)
    assert bead is not None
    assert bead.status == "OPEN"
