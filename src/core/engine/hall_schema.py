from __future__ import annotations

import contextlib
import json
import sqlite3
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Literal

from src.core.engine.gungnir.schema import GungnirMatrix, build_gungnir_matrix, get_gungnir_overall, matrix_to_dict

HallRepositoryStatus = Literal["DORMANT", "AWAKE", "AGENT_LOOP"]
HallScanStatus = Literal["PENDING", "COMPLETED", "FAILED"]
HallBeadStatus = Literal["OPEN", "IN_PROGRESS", "READY_FOR_REVIEW", "NEEDS_TRIAGE", "BLOCKED", "RESOLVED", "ARCHIVED", "SUPERSEDED"]
HallBeadTargetKind = Literal["FILE", "SECTOR", "REPOSITORY", "CONTRACT", "SPOKE", "WORKFLOW", "VALIDATION", "OTHER"]
HallValidationVerdict = Literal["ACCEPTED", "REJECTED", "INCONCLUSIVE", "SUCCESS", "FAILURE"]
HallSkillProposalStatus = Literal["PROPOSED", "VALIDATED", "PROMOTED", "REJECTED", "SUPERSEDED"]
HallPlanningSessionStatus = Literal["NEEDS_INPUT", "PLAN_READY", "ROUTED", "COMPLETED", "FAILED"]


@dataclass
class HallRepositoryRecord:
    repo_id: str
    root_path: str
    name: str
    status: HallRepositoryStatus = "DORMANT"
    active_persona: str = "ALFRED"
    baseline_gungnir_score: float = 0.0
    intent_integrity: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: int = 0
    updated_at: int = 0


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
    intent_summary: str | None = None
    interaction_summary: str | None = None


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
    status: HallBeadStatus = "OPEN"
    assigned_agent: str | None = None
    source_kind: str | None = None
    triage_reason: str | None = None
    resolution_note: str | None = None
    resolved_validation_id: str | None = None
    superseded_by: str | None = None


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
    metadata: dict[str, Any] = field(default_factory=dict)


def normalize_hall_path(input_path: str | Path) -> str:
    return str(input_path).replace("\\", "/").rstrip("/")


def build_repo_id(root_path: str | Path) -> str:
    return f"repo:{normalize_hall_path(root_path)}"


class HallOfRecords:
    """Canonical SQLite-backed Hall schema for repository scans and outcomes."""

    def __init__(self, project_root: Path | str):
        self.project_root = Path(project_root)
        self.db_path = self.project_root / ".stats" / "pennyone.db"
        self.state_path = self.project_root / ".agents" / "sovereign_state.json"

    def connect(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def ensure_schema(self) -> None:
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS hall_repositories (
                    repo_id TEXT PRIMARY KEY,
                    root_path TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'DORMANT',
                    active_persona TEXT NOT NULL DEFAULT 'ALFRED',
                    baseline_gungnir_score REAL NOT NULL DEFAULT 0,
                    intent_integrity REAL NOT NULL DEFAULT 0,
                    metadata_json TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS hall_scans (
                    scan_id TEXT PRIMARY KEY,
                    repo_id TEXT NOT NULL,
                    scan_kind TEXT NOT NULL,
                    status TEXT NOT NULL,
                    baseline_gungnir_score REAL NOT NULL DEFAULT 0,
                    started_at INTEGER NOT NULL,
                    completed_at INTEGER,
                    metadata_json TEXT,
                    FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
                );

                CREATE INDEX IF NOT EXISTS idx_hall_scans_repo ON hall_scans(repo_id);

                CREATE TABLE IF NOT EXISTS hall_files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    repo_id TEXT NOT NULL,
                    scan_id TEXT NOT NULL,
                    path TEXT NOT NULL,
                    content_hash TEXT,
                    language TEXT,
                    gungnir_score REAL NOT NULL DEFAULT 0,
                    matrix_json TEXT,
                    intent_summary TEXT,
                    interaction_summary TEXT,
                    created_at INTEGER NOT NULL,
                    UNIQUE(scan_id, path),
                    FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
                    FOREIGN KEY(scan_id) REFERENCES hall_scans(scan_id)
                );

                CREATE INDEX IF NOT EXISTS idx_hall_files_repo_path ON hall_files(repo_id, path);

                CREATE TABLE IF NOT EXISTS hall_beads (
                    bead_id TEXT PRIMARY KEY,
                    repo_id TEXT NOT NULL,
                    scan_id TEXT,
                    legacy_id INTEGER,
                    target_kind TEXT NOT NULL DEFAULT 'FILE',
                    target_ref TEXT,
                    target_path TEXT,
                    rationale TEXT NOT NULL,
                    contract_refs_json TEXT,
                    baseline_scores_json TEXT,
                    acceptance_criteria TEXT,
                    status TEXT NOT NULL DEFAULT 'OPEN',
                    assigned_agent TEXT,
                    source_kind TEXT,
                    triage_reason TEXT,
                    resolution_note TEXT,
                    resolved_validation_id TEXT,
                    superseded_by TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    UNIQUE(repo_id, legacy_id),
                    FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
                    FOREIGN KEY(scan_id) REFERENCES hall_scans(scan_id)
                );

                CREATE INDEX IF NOT EXISTS idx_hall_beads_repo_status ON hall_beads(repo_id, status);

                CREATE TABLE IF NOT EXISTS hall_validation_runs (
                    validation_id TEXT PRIMARY KEY,
                    repo_id TEXT NOT NULL,
                    scan_id TEXT,
                    bead_id TEXT,
                    target_path TEXT,
                    verdict TEXT NOT NULL,
                    sprt_verdict TEXT,
                    pre_scores_json TEXT,
                    post_scores_json TEXT,
                    benchmark_json TEXT,
                    notes TEXT,
                    created_at INTEGER NOT NULL,
                    legacy_trace_id INTEGER,
                    UNIQUE(repo_id, legacy_trace_id),
                    FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
                    FOREIGN KEY(scan_id) REFERENCES hall_scans(scan_id),
                    FOREIGN KEY(bead_id) REFERENCES hall_beads(bead_id)
                );

                CREATE INDEX IF NOT EXISTS idx_hall_validation_repo ON hall_validation_runs(repo_id, created_at);

                CREATE TABLE IF NOT EXISTS hall_skill_observations (
                    observation_id TEXT PRIMARY KEY,
                    repo_id TEXT NOT NULL,
                    skill_id TEXT NOT NULL,
                    outcome TEXT NOT NULL,
                    observation TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    metadata_json TEXT,
                    FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
                );

                CREATE TABLE IF NOT EXISTS hall_skill_proposals (
                    proposal_id TEXT PRIMARY KEY,
                    repo_id TEXT NOT NULL,
                    skill_id TEXT NOT NULL,
                    bead_id TEXT,
                    validation_id TEXT,
                    target_path TEXT,
                    contract_path TEXT,
                    proposal_path TEXT,
                    status TEXT NOT NULL,
                    summary TEXT,
                    promotion_note TEXT,
                    promoted_at INTEGER,
                    promoted_by TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    metadata_json TEXT,
                    FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
                    FOREIGN KEY(bead_id) REFERENCES hall_beads(bead_id),
                    FOREIGN KEY(validation_id) REFERENCES hall_validation_runs(validation_id)
                );

                CREATE INDEX IF NOT EXISTS idx_hall_skill_proposals_repo
                ON hall_skill_proposals(repo_id, created_at);

                CREATE TABLE IF NOT EXISTS hall_planning_sessions (
                    session_id TEXT PRIMARY KEY,
                    repo_id TEXT NOT NULL,
                    skill_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    user_intent TEXT NOT NULL,
                    normalized_intent TEXT NOT NULL,
                    summary TEXT,
                    latest_question TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    metadata_json TEXT,
                    FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
                );

                CREATE INDEX IF NOT EXISTS idx_hall_planning_repo
                ON hall_planning_sessions(repo_id, updated_at);

                DROP VIEW IF EXISTS hall_repository_projection;
                CREATE VIEW hall_repository_projection AS
                SELECT
                    r.repo_id,
                    r.root_path,
                    r.name,
                    r.status,
                    r.active_persona,
                    r.baseline_gungnir_score,
                    r.intent_integrity,
                    (
                        SELECT s.scan_id
                        FROM hall_scans s
                        WHERE s.repo_id = r.repo_id
                        ORDER BY COALESCE(s.completed_at, s.started_at) DESC
                        LIMIT 1
                    ) AS last_scan_id,
                    (
                        SELECT s.status
                        FROM hall_scans s
                        WHERE s.repo_id = r.repo_id
                        ORDER BY COALESCE(s.completed_at, s.started_at) DESC
                        LIMIT 1
                    ) AS last_scan_status,
                    (
                        SELECT COALESCE(s.completed_at, s.started_at)
                        FROM hall_scans s
                        WHERE s.repo_id = r.repo_id
                        ORDER BY COALESCE(s.completed_at, s.started_at) DESC
                        LIMIT 1
                    ) AS last_scan_at,
                    (
                        SELECT COUNT(*)
                        FROM hall_beads b
                        WHERE b.repo_id = r.repo_id
                          AND b.status IN ('OPEN', 'IN_PROGRESS')
                    ) AS open_beads,
                    (
                        SELECT COUNT(*)
                        FROM hall_validation_runs v
                        WHERE v.repo_id = r.repo_id
                    ) AS validation_runs,
                    (
                        SELECT MAX(v.created_at)
                        FROM hall_validation_runs v
                        WHERE v.repo_id = r.repo_id
                    ) AS last_validation_at
                FROM hall_repositories r;
                """
            )
            self._ensure_column(conn, "hall_beads", "target_kind", "TEXT NOT NULL DEFAULT 'FILE'")
            self._ensure_column(conn, "hall_beads", "target_ref", "TEXT")
            self._ensure_column(conn, "hall_beads", "source_kind", "TEXT")
            self._ensure_column(conn, "hall_beads", "triage_reason", "TEXT")
            self._ensure_column(conn, "hall_beads", "resolution_note", "TEXT")
            self._ensure_column(conn, "hall_beads", "resolved_validation_id", "TEXT")
            self._ensure_column(conn, "hall_beads", "superseded_by", "TEXT")
            self._ensure_column(conn, "hall_skill_proposals", "summary", "TEXT")
            self._ensure_column(conn, "hall_skill_proposals", "promotion_note", "TEXT")
            self._ensure_column(conn, "hall_skill_proposals", "promoted_at", "INTEGER")
            self._ensure_column(conn, "hall_skill_proposals", "promoted_by", "TEXT")
            self._ensure_column(conn, "hall_skill_proposals", "metadata_json", "TEXT")
            self._ensure_column(conn, "hall_planning_sessions", "summary", "TEXT")
            self._ensure_column(conn, "hall_planning_sessions", "latest_question", "TEXT")
            self._ensure_column(conn, "hall_planning_sessions", "metadata_json", "TEXT")
            conn.executescript(
                """
                DROP VIEW IF EXISTS hall_repository_projection;
                CREATE VIEW hall_repository_projection AS
                SELECT
                    r.repo_id,
                    r.root_path,
                    r.name,
                    r.status,
                    r.active_persona,
                    r.baseline_gungnir_score,
                    r.intent_integrity,
                    (
                        SELECT s.scan_id
                        FROM hall_scans s
                        WHERE s.repo_id = r.repo_id
                        ORDER BY COALESCE(s.completed_at, s.started_at) DESC
                        LIMIT 1
                    ) AS last_scan_id,
                    (
                        SELECT s.status
                        FROM hall_scans s
                        WHERE s.repo_id = r.repo_id
                        ORDER BY COALESCE(s.completed_at, s.started_at) DESC
                        LIMIT 1
                    ) AS last_scan_status,
                    (
                        SELECT COALESCE(s.completed_at, s.started_at)
                        FROM hall_scans s
                        WHERE s.repo_id = r.repo_id
                        ORDER BY COALESCE(s.completed_at, s.started_at) DESC
                        LIMIT 1
                    ) AS last_scan_at,
                    (
                        SELECT COUNT(*)
                        FROM hall_beads b
                        WHERE b.repo_id = r.repo_id
                          AND b.status IN ('OPEN', 'IN_PROGRESS', 'READY_FOR_REVIEW')
                    ) AS open_beads,
                    (
                        SELECT COUNT(*)
                        FROM hall_validation_runs v
                        WHERE v.repo_id = r.repo_id
                    ) AS validation_runs,
                    (
                        SELECT MAX(v.created_at)
                        FROM hall_validation_runs v
                        WHERE v.repo_id = r.repo_id
                    ) AS last_validation_at
                FROM hall_repositories r;
                """
            )

    def bootstrap_repository(self) -> HallRepositoryRecord:
        self.ensure_schema()
        existing = self.get_repository_record()
        if existing is not None:
            return existing

        legacy_state = self._read_legacy_state()
        framework = legacy_state.get("framework", {})
        repo = HallRepositoryRecord(
            repo_id=build_repo_id(self.project_root),
            root_path=normalize_hall_path(self.project_root),
            name=self.project_root.name,
            status=framework.get("status", "DORMANT"),
            active_persona=framework.get("active_persona", "ALFRED"),
            baseline_gungnir_score=float(framework.get("gungnir_score", 0) or 0),
            intent_integrity=float(framework.get("intent_integrity", 0) or 0),
            metadata={
                "source": "legacy-sovereign-projection",
                "sovereign_projection": {
                    "framework": {
                        "last_awakening": int(framework.get("last_awakening", 0) or 0),
                    },
                    "identity": legacy_state.get("identity"),
                    "hall_of_records": legacy_state.get("hall_of_records"),
                },
            },
            created_at=int(framework.get("last_awakening", 0) or 0),
            updated_at=int(framework.get("last_awakening", 0) or 0),
        )
        self.upsert_repository(repo)
        return repo

    def upsert_repository(self, record: HallRepositoryRecord) -> None:
        now = max(record.updated_at, record.created_at, self._now())
        created_at = record.created_at or now
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO hall_repositories (
                    repo_id, root_path, name, status, active_persona, baseline_gungnir_score,
                    intent_integrity, metadata_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(repo_id) DO UPDATE SET
                    root_path = excluded.root_path,
                    name = excluded.name,
                    status = excluded.status,
                    active_persona = excluded.active_persona,
                    baseline_gungnir_score = excluded.baseline_gungnir_score,
                    intent_integrity = excluded.intent_integrity,
                    metadata_json = excluded.metadata_json,
                    updated_at = excluded.updated_at
                """,
                (
                    record.repo_id,
                    normalize_hall_path(record.root_path),
                    record.name,
                    record.status,
                    record.active_persona,
                    record.baseline_gungnir_score,
                    record.intent_integrity,
                    json.dumps(record.metadata),
                    created_at,
                    now,
                ),
            )

    def record_scan(self, record: HallScanRecord) -> None:
        self.ensure_schema()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO hall_scans (
                    scan_id, repo_id, scan_kind, status, baseline_gungnir_score,
                    started_at, completed_at, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(scan_id) DO UPDATE SET
                    status = excluded.status,
                    baseline_gungnir_score = excluded.baseline_gungnir_score,
                    completed_at = excluded.completed_at,
                    metadata_json = excluded.metadata_json
                """,
                (
                    record.scan_id,
                    record.repo_id,
                    record.scan_kind,
                    record.status,
                    record.baseline_gungnir_score,
                    record.started_at,
                    record.completed_at,
                    json.dumps(record.metadata),
                ),
            )

    def record_file(self, record: HallFileRecord) -> None:
        self.ensure_schema()
        materialized_matrix = build_gungnir_matrix(record.matrix)
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO hall_files (
                    repo_id, scan_id, path, content_hash, language, gungnir_score,
                    matrix_json, intent_summary, interaction_summary, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(scan_id, path) DO UPDATE SET
                    content_hash = excluded.content_hash,
                    language = excluded.language,
                    gungnir_score = excluded.gungnir_score,
                    matrix_json = excluded.matrix_json,
                    intent_summary = excluded.intent_summary,
                    interaction_summary = excluded.interaction_summary
                """,
                (
                    record.repo_id,
                    record.scan_id,
                    normalize_hall_path(record.path),
                    record.content_hash,
                    record.language,
                    record.gungnir_score or get_gungnir_overall(materialized_matrix),
                    json.dumps(matrix_to_dict(materialized_matrix)),
                    record.intent_summary,
                    record.interaction_summary,
                    record.created_at,
                ),
            )

    def upsert_bead(self, record: HallBeadRecord) -> None:
        self.ensure_schema()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO hall_beads (
                    bead_id, repo_id, scan_id, legacy_id, target_kind, target_ref, target_path, rationale, contract_refs_json,
                    baseline_scores_json, acceptance_criteria, status, assigned_agent, source_kind, triage_reason,
                    resolution_note, resolved_validation_id, superseded_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(bead_id) DO UPDATE SET
                    scan_id = excluded.scan_id,
                    legacy_id = excluded.legacy_id,
                    target_kind = excluded.target_kind,
                    target_ref = excluded.target_ref,
                    target_path = excluded.target_path,
                    rationale = excluded.rationale,
                    contract_refs_json = excluded.contract_refs_json,
                    baseline_scores_json = excluded.baseline_scores_json,
                    acceptance_criteria = excluded.acceptance_criteria,
                    status = excluded.status,
                    assigned_agent = excluded.assigned_agent,
                    source_kind = excluded.source_kind,
                    triage_reason = excluded.triage_reason,
                    resolution_note = excluded.resolution_note,
                    resolved_validation_id = excluded.resolved_validation_id,
                    superseded_by = excluded.superseded_by,
                    updated_at = excluded.updated_at
                """,
                (
                    record.bead_id,
                    record.repo_id,
                    record.scan_id,
                    record.legacy_id,
                    record.target_kind,
                    normalize_hall_path(record.target_ref) if record.target_ref and "/" in record.target_ref else record.target_ref,
                    normalize_hall_path(record.target_path) if record.target_path else None,
                    record.rationale,
                    json.dumps(record.contract_refs),
                    json.dumps(record.baseline_scores),
                    record.acceptance_criteria,
                    record.status,
                    record.assigned_agent,
                    record.source_kind,
                    record.triage_reason,
                    record.resolution_note,
                    record.resolved_validation_id,
                    record.superseded_by,
                    record.created_at,
                    record.updated_at,
                ),
            )

    def save_validation_run(self, record: HallValidationRun) -> None:
        self.ensure_schema()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO hall_validation_runs (
                    validation_id, repo_id, scan_id, bead_id, target_path, verdict, sprt_verdict,
                    pre_scores_json, post_scores_json, benchmark_json, notes, created_at, legacy_trace_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(validation_id) DO UPDATE SET
                    verdict = excluded.verdict,
                    sprt_verdict = excluded.sprt_verdict,
                    pre_scores_json = excluded.pre_scores_json,
                    post_scores_json = excluded.post_scores_json,
                    benchmark_json = excluded.benchmark_json,
                    notes = excluded.notes
                """,
                (
                    record.validation_id,
                    record.repo_id,
                    record.scan_id,
                    record.bead_id,
                    normalize_hall_path(record.target_path) if record.target_path else None,
                    record.verdict,
                    record.sprt_verdict,
                    json.dumps(record.pre_scores),
                    json.dumps(record.post_scores),
                    json.dumps(record.benchmark),
                    record.notes,
                    record.created_at,
                    record.legacy_trace_id,
                ),
            )

    def save_skill_observation(self, record: HallSkillObservation) -> None:
        self.ensure_schema()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO hall_skill_observations (
                    observation_id, repo_id, skill_id, outcome, observation, created_at, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(observation_id) DO UPDATE SET
                    outcome = excluded.outcome,
                    observation = excluded.observation,
                    metadata_json = excluded.metadata_json
                """,
                (
                    record.observation_id,
                    record.repo_id,
                    record.skill_id,
                    record.outcome,
                    record.observation,
                    record.created_at,
                    json.dumps(record.metadata),
                ),
            )

    def save_skill_proposal(self, record: HallSkillProposalRecord) -> None:
        self.ensure_schema()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO hall_skill_proposals (
                    proposal_id, repo_id, skill_id, bead_id, validation_id, target_path, contract_path,
                    proposal_path, status, summary, promotion_note, promoted_at, promoted_by,
                    created_at, updated_at, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(proposal_id) DO UPDATE SET
                    skill_id = excluded.skill_id,
                    bead_id = excluded.bead_id,
                    validation_id = excluded.validation_id,
                    target_path = excluded.target_path,
                    contract_path = excluded.contract_path,
                    proposal_path = excluded.proposal_path,
                    status = excluded.status,
                    summary = excluded.summary,
                    promotion_note = excluded.promotion_note,
                    promoted_at = excluded.promoted_at,
                    promoted_by = excluded.promoted_by,
                    updated_at = excluded.updated_at,
                    metadata_json = excluded.metadata_json
                """,
                (
                    record.proposal_id,
                    record.repo_id,
                    record.skill_id,
                    record.bead_id,
                    record.validation_id,
                    normalize_hall_path(record.target_path) if record.target_path else None,
                    normalize_hall_path(record.contract_path) if record.contract_path else None,
                    normalize_hall_path(record.proposal_path) if record.proposal_path else None,
                    record.status,
                    record.summary,
                    record.promotion_note,
                    record.promoted_at,
                    record.promoted_by,
                    record.created_at,
                    record.updated_at,
                    json.dumps(record.metadata),
                ),
            )

    def get_skill_proposal(self, proposal_id: str) -> HallSkillProposalRecord | None:
        self.ensure_schema()
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT proposal_id, repo_id, skill_id, bead_id, validation_id, target_path, contract_path,
                       proposal_path, status, summary, promotion_note, promoted_at, promoted_by,
                       created_at, updated_at, metadata_json
                FROM hall_skill_proposals
                WHERE proposal_id = ?
                LIMIT 1
                """,
                (proposal_id,),
            ).fetchone()
        if row is None:
            return None
        return HallSkillProposalRecord(
            proposal_id=str(row["proposal_id"]),
            repo_id=str(row["repo_id"]),
            skill_id=str(row["skill_id"]),
            status=row["status"],
            created_at=int(row["created_at"] or 0),
            updated_at=int(row["updated_at"] or 0),
            bead_id=str(row["bead_id"]) if row["bead_id"] is not None else None,
            validation_id=str(row["validation_id"]) if row["validation_id"] is not None else None,
            target_path=str(row["target_path"]) if row["target_path"] is not None else None,
            contract_path=str(row["contract_path"]) if row["contract_path"] is not None else None,
            proposal_path=str(row["proposal_path"]) if row["proposal_path"] is not None else None,
            summary=str(row["summary"]) if row["summary"] is not None else None,
            promotion_note=str(row["promotion_note"]) if row["promotion_note"] is not None else None,
            promoted_at=int(row["promoted_at"]) if row["promoted_at"] is not None else None,
            promoted_by=str(row["promoted_by"]) if row["promoted_by"] is not None else None,
            metadata=json.loads(row["metadata_json"] or "{}"),
        )

    def list_skill_proposals(
        self,
        *,
        repo_id: str | None = None,
        skill_id: str | None = None,
        statuses: tuple[HallSkillProposalStatus, ...] | None = None,
    ) -> list[HallSkillProposalRecord]:
        self.ensure_schema()
        clauses = ["repo_id = ?"]
        params: list[Any] = [repo_id or build_repo_id(self.project_root)]

        if skill_id is not None:
            clauses.append("skill_id = ?")
            params.append(skill_id)
        if statuses:
            clauses.append(f"status IN ({', '.join('?' for _ in statuses)})")
            params.extend(statuses)

        sql = f"""
            SELECT proposal_id, repo_id, skill_id, bead_id, validation_id, target_path, contract_path,
                   proposal_path, status, summary, promotion_note, promoted_at, promoted_by,
                   created_at, updated_at, metadata_json
            FROM hall_skill_proposals
            WHERE {' AND '.join(clauses)}
            ORDER BY created_at DESC
        """
        with self.connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [
            HallSkillProposalRecord(
                proposal_id=str(row["proposal_id"]),
                repo_id=str(row["repo_id"]),
                skill_id=str(row["skill_id"]),
                status=row["status"],
                created_at=int(row["created_at"] or 0),
                updated_at=int(row["updated_at"] or 0),
                bead_id=str(row["bead_id"]) if row["bead_id"] is not None else None,
                validation_id=str(row["validation_id"]) if row["validation_id"] is not None else None,
                target_path=str(row["target_path"]) if row["target_path"] is not None else None,
                contract_path=str(row["contract_path"]) if row["contract_path"] is not None else None,
                proposal_path=str(row["proposal_path"]) if row["proposal_path"] is not None else None,
                summary=str(row["summary"]) if row["summary"] is not None else None,
                promotion_note=str(row["promotion_note"]) if row["promotion_note"] is not None else None,
                promoted_at=int(row["promoted_at"]) if row["promoted_at"] is not None else None,
                promoted_by=str(row["promoted_by"]) if row["promoted_by"] is not None else None,
                metadata=json.loads(row["metadata_json"] or "{}"),
            )
            for row in rows
        ]

    def get_validation_run(self, validation_id: str) -> HallValidationRun | None:
        self.ensure_schema()
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT validation_id, repo_id, scan_id, bead_id, target_path, verdict, sprt_verdict,
                       pre_scores_json, post_scores_json, benchmark_json, notes, created_at, legacy_trace_id
                FROM hall_validation_runs
                WHERE validation_id = ?
                LIMIT 1
                """,
                (validation_id,),
            ).fetchone()
        if row is None:
            return None
        return HallValidationRun(
            validation_id=str(row["validation_id"]),
            repo_id=str(row["repo_id"]),
            scan_id=str(row["scan_id"]) if row["scan_id"] is not None else None,
            bead_id=str(row["bead_id"]) if row["bead_id"] is not None else None,
            target_path=str(row["target_path"]) if row["target_path"] is not None else None,
            verdict=row["verdict"],
            sprt_verdict=str(row["sprt_verdict"]) if row["sprt_verdict"] is not None else None,
            pre_scores=json.loads(row["pre_scores_json"] or "{}"),
            post_scores=json.loads(row["post_scores_json"] or "{}"),
            benchmark=json.loads(row["benchmark_json"] or "{}"),
            notes=str(row["notes"]) if row["notes"] is not None else None,
            created_at=int(row["created_at"] or 0),
            legacy_trace_id=int(row["legacy_trace_id"]) if row["legacy_trace_id"] is not None else None,
        )

    def get_repository_record(self, root_path: str | Path | None = None) -> HallRepositoryRecord | None:
        self.ensure_schema()
        repo_path = normalize_hall_path(root_path or self.project_root)
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT repo_id, root_path, name, status, active_persona, baseline_gungnir_score,
                       intent_integrity, metadata_json, created_at, updated_at
                FROM hall_repositories
                WHERE root_path = ?
                """,
                (repo_path,),
            ).fetchone()
            if row is None:
                return None
            return HallRepositoryRecord(
                repo_id=str(row["repo_id"]),
                root_path=str(row["root_path"]),
                name=str(row["name"]),
                status=row["status"],
                active_persona=str(row["active_persona"]),
                baseline_gungnir_score=float(row["baseline_gungnir_score"] or 0),
                intent_integrity=float(row["intent_integrity"] or 0),
                metadata=json.loads(row["metadata_json"] or "{}"),
                created_at=int(row["created_at"] or 0),
                updated_at=int(row["updated_at"] or 0),
            )

    def get_repository_summary(self, root_path: str | Path | None = None) -> dict[str, Any] | None:
        self.ensure_schema()
        repo_path = normalize_hall_path(root_path or self.project_root)
        with self.connect() as conn:
            row = conn.execute(
                "SELECT * FROM hall_repository_projection WHERE root_path = ?",
                (repo_path,),
            ).fetchone()
            return dict(row) if row else None

    def migrate_legacy_records(self) -> dict[str, int]:
        self.ensure_schema()
        repo = self.bootstrap_repository()
        migrated_scans = 0
        migrated_beads = 0
        migrated_validations = 0

        with self.connect() as conn:
            bead_columns = self._table_columns(conn, "norn_beads")
            if bead_columns:
                rows = conn.execute("SELECT * FROM norn_beads").fetchall()
                for row in rows:
                    row_dict = dict(row)
                    bead_id = f"legacy-bead:{row_dict.get('id')}"
                    status = row_dict.get("status") or "OPEN"
                    if status in {"OPEN", "IN_PROGRESS"}:
                        status = "NEEDS_TRIAGE"
                    elif status == "RESOLVED":
                        status = "ARCHIVED"
                    self.upsert_bead(
                        HallBeadRecord(
                            bead_id=bead_id,
                            repo_id=repo.repo_id,
                            rationale=row_dict.get("description", ""),
                            created_at=int(row_dict.get("timestamp") or self._now()),
                            updated_at=int(row_dict.get("timestamp") or self._now()),
                            legacy_id=row_dict.get("id"),
                            target_kind="OTHER",
                            status=status,
                            assigned_agent=row_dict.get("assigned_raven") or row_dict.get("agent_id"),
                            source_kind="LEGACY_IMPORT",
                            triage_reason="Imported legacy bead requires canonical target identity and acceptance criteria." if status == "NEEDS_TRIAGE" else None,
                            resolution_note="Imported legacy resolved bead preserved without canonical validation evidence." if status == "ARCHIVED" else None,
                        )
                    )
                    migrated_beads += 1

            trace_columns = self._table_columns(conn, "mission_traces")
            if trace_columns:
                rows = conn.execute("SELECT * FROM mission_traces ORDER BY timestamp ASC").fetchall()
                seen_scans: set[str] = set()
                for row in rows:
                    row_dict = dict(row)
                    mission_id = row_dict.get("mission_id") or f"legacy-scan:{row_dict.get('id')}"
                    scan_id = f"legacy-scan:{mission_id}"
                    if scan_id not in seen_scans:
                        self.record_scan(
                            HallScanRecord(
                                scan_id=scan_id,
                                repo_id=repo.repo_id,
                                scan_kind="legacy_mission_trace",
                                status="COMPLETED",
                                started_at=int(row_dict.get("timestamp") or self._now()),
                                completed_at=int(row_dict.get("timestamp") or self._now()),
                                baseline_gungnir_score=float(row_dict.get("initial_score") or 0),
                                metadata={"mission_id": mission_id},
                            )
                        )
                        seen_scans.add(scan_id)
                        migrated_scans += 1

                    self.save_validation_run(
                        HallValidationRun(
                            validation_id=f"legacy-validation:{row_dict.get('id')}",
                            repo_id=repo.repo_id,
                            scan_id=scan_id,
                            target_path=row_dict.get("file_path"),
                            verdict=(row_dict.get("status") or "INCONCLUSIVE"),
                            sprt_verdict="legacy_trace",
                            pre_scores={"overall": row_dict.get("initial_score")},
                            post_scores={"overall": row_dict.get("final_score")},
                            benchmark={"target_metric": row_dict.get("target_metric")},
                            notes=row_dict.get("justification"),
                            created_at=int(row_dict.get("timestamp") or self._now()),
                            legacy_trace_id=row_dict.get("id"),
                        )
                    )
                    migrated_validations += 1

        return {
            "repositories": 1,
            "scans": migrated_scans,
            "beads": migrated_beads,
            "validation_runs": migrated_validations,
        }

    def _read_legacy_state(self) -> dict[str, Any]:
        if not self.state_path.exists():
            return {}
        with contextlib.suppress(json.JSONDecodeError, OSError):
            return json.loads(self.state_path.read_text(encoding="utf-8"))
        return {}

    @staticmethod
    def _table_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
        rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        return {row["name"] for row in rows}

    @staticmethod
    def _ensure_column(conn: sqlite3.Connection, table_name: str, column_name: str, column_sql: str) -> None:
        if column_name in HallOfRecords._table_columns(conn, table_name):
            return
        conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}")

    @staticmethod
    def _now() -> int:
        return int(__import__("time").time() * 1000)
