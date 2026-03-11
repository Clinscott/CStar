import json
import sqlite3

from src.core.engine.hall_schema import (
    HallOfRecords,
    HallRepositoryRecord,
    HallSkillProposalRecord,
    build_repo_id,
)


def test_hall_schema_bootstraps_repository_projection(tmp_path):
    agents_dir = tmp_path / ".agents"
    agents_dir.mkdir()
    (agents_dir / "sovereign_state.json").write_text(
        json.dumps(
            {
                "framework": {
                    "status": "AWAKE",
                    "active_persona": "ODIN",
                    "gungnir_score": 77,
                    "intent_integrity": 93,
                    "last_awakening": 1700000000000,
                },
                "hall_of_records": {"description": "Test Hall"},
            }
        ),
        encoding="utf-8",
    )

    hall = HallOfRecords(tmp_path)
    hall.bootstrap_repository()

    summary = hall.get_repository_summary()
    assert summary is not None
    assert summary["repo_id"] == build_repo_id(tmp_path)
    assert summary["status"] == "AWAKE"
    assert summary["active_persona"] == "ODIN"
    assert summary["baseline_gungnir_score"] == 77
    assert summary["intent_integrity"] == 93


def test_hall_schema_migrates_legacy_records(tmp_path):
    stats_dir = tmp_path / ".stats"
    stats_dir.mkdir()
    db_path = stats_dir / "pennyone.db"

    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE norn_beads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                description TEXT,
                status TEXT,
                assigned_raven TEXT,
                timestamp INTEGER
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE mission_traces (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mission_id TEXT,
                file_path TEXT,
                target_metric TEXT,
                initial_score REAL,
                final_score REAL,
                justification TEXT,
                status TEXT,
                timestamp INTEGER
            )
            """
        )
        conn.execute(
            "INSERT INTO norn_beads (description, status, assigned_raven, timestamp) VALUES (?, ?, ?, ?)",
            ("Legacy bead", "OPEN", "RAVEN-1", 1700000001000),
        )
        conn.execute(
            """
            INSERT INTO mission_traces (
                mission_id, file_path, target_metric, initial_score, final_score, justification, status, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            ("mission-1", "src/core/vector.py", "LOGIC", 44, 90, "Legacy uplift", "SUCCESS", 1700000002000),
        )
        conn.commit()

    hall = HallOfRecords(tmp_path)
    migrated = hall.migrate_legacy_records()
    summary = hall.get_repository_summary()

    assert migrated["repositories"] == 1
    assert migrated["scans"] == 1
    assert migrated["beads"] == 1
    assert migrated["validation_runs"] == 1
    assert summary is not None
    assert summary["open_beads"] == 0
    assert summary["validation_runs"] == 1

    with hall.connect() as conn:
        row = conn.execute(
            "SELECT status, source_kind, triage_reason FROM hall_beads WHERE bead_id = 'legacy-bead:1'"
        ).fetchone()

    assert row["status"] == "NEEDS_TRIAGE"
    assert row["source_kind"] == "LEGACY_IMPORT"
    assert "canonical target identity" in row["triage_reason"]


def test_hall_schema_bootstrap_does_not_overwrite_existing_repository_authority(tmp_path):
    agents_dir = tmp_path / ".agents"
    agents_dir.mkdir()
    (agents_dir / "sovereign_state.json").write_text(
        json.dumps(
            {
                "framework": {
                    "status": "DORMANT",
                    "active_persona": "ODIN",
                    "gungnir_score": 1,
                    "intent_integrity": 2,
                    "last_awakening": 1,
                }
            }
        ),
        encoding="utf-8",
    )

    hall = HallOfRecords(tmp_path)
    hall.ensure_schema()
    hall.upsert_repository(
        HallRepositoryRecord(
            repo_id=build_repo_id(tmp_path),
            root_path=str(tmp_path).replace("\\", "/"),
            name=tmp_path.name,
            status="AGENT_LOOP",
            active_persona="ALFRED",
            baseline_gungnir_score=88.0,
            intent_integrity=96.0,
            metadata={
                "source": "hall-authority",
                "sovereign_projection": {
                    "framework": {"last_awakening": 1700000001000, "mission_id": "MISSION-100"},
                },
            },
            created_at=1700000000000,
            updated_at=1700000001000,
        )
    )

    record = hall.bootstrap_repository()
    summary = hall.get_repository_summary()

    assert record.status == "AGENT_LOOP"
    assert record.active_persona == "ALFRED"
    assert record.metadata["source"] == "hall-authority"
    assert summary is not None
    assert summary["status"] == "AGENT_LOOP"
    assert summary["active_persona"] == "ALFRED"


def test_hall_schema_persists_skill_proposals_separately_from_observations(tmp_path):
    agents_dir = tmp_path / ".agents"
    agents_dir.mkdir()
    (agents_dir / "sovereign_state.json").write_text(json.dumps({}), encoding="utf-8")

    hall = HallOfRecords(tmp_path)
    repo = hall.bootstrap_repository()
    hall.save_skill_proposal(
        HallSkillProposalRecord(
            proposal_id="proposal:evolve-1",
            repo_id=repo.repo_id,
            skill_id="evolve",
            bead_id="bead-1",
            validation_id="validation-1",
            target_path=".agents/skills/evolve/contract.json",
            contract_path=".agents/skills/evolve/contract.json",
            proposal_path=".agents/proposals/evolve/proposal_evolve_1.json",
            status="PROPOSED",
            summary="Promote the validated focus-axis defaults into the canonical evolve contract.",
            created_at=1700000000000,
            updated_at=1700000000000,
            metadata={"source": "unit-test"},
        )
    )

    proposal = hall.get_skill_proposal("proposal:evolve-1")
    proposals = hall.list_skill_proposals(skill_id="evolve")

    assert proposal is not None
    assert proposal.skill_id == "evolve"
    assert proposal.validation_id == "validation-1"
    assert proposal.status == "PROPOSED"
    assert proposal.metadata["source"] == "unit-test"
    assert len(proposals) == 1
    assert proposals[0].proposal_path == ".agents/proposals/evolve/proposal_evolve_1.json"
