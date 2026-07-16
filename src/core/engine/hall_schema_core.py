from __future__ import annotations

import json
import os
import sqlite3
import stat
from pathlib import Path

from src.core.engine.gungnir.schema import (
    build_gungnir_matrix,
    get_gungnir_overall,
    matrix_to_dict,
)

from .hall_records import (
    HallFileRecord,
    HallRepositoryRecord,
    HallScanRecord,
    build_repo_id,
    normalize_hall_path,
)

class HallSchemaCoreMixin:
    BUSY_TIMEOUT_MS = 5000

    def __init__(self, project_root: Path | str):
        self.project_root = Path(project_root)
        self.db_path = self.project_root / ".stats" / "pennyone.db"

    def _resolve_store_path(self) -> tuple[Path, os.stat_result | None]:
        lexical_root = self.project_root.absolute()
        try:
            root_stat = lexical_root.lstat()
        except FileNotFoundError as error:
            raise RuntimeError("hall_root_missing") from error
        if stat.S_ISLNK(root_stat.st_mode):
            raise RuntimeError("hall_root_symlink_forbidden")
        if not stat.S_ISDIR(root_stat.st_mode):
            raise RuntimeError("hall_root_not_directory")
        canonical_root = lexical_root.resolve(strict=True)

        stats_dir = canonical_root / ".stats"
        try:
            stats_stat = stats_dir.lstat()
        except FileNotFoundError:
            stats_dir.mkdir(mode=0o700)
            stats_stat = stats_dir.lstat()
        if stat.S_ISLNK(stats_stat.st_mode):
            raise RuntimeError("hall_stats_symlink_forbidden")
        if not stat.S_ISDIR(stats_stat.st_mode):
            raise RuntimeError("hall_stats_not_directory")
        if stats_dir.resolve(strict=True) != stats_dir:
            raise RuntimeError("hall_stats_path_not_canonical")

        db_path = stats_dir / "pennyone.db"
        try:
            db_stat = db_path.lstat()
        except FileNotFoundError:
            db_stat = None
        if db_stat is not None:
            if stat.S_ISLNK(db_stat.st_mode):
                raise RuntimeError("hall_store_symlink_forbidden")
            if not stat.S_ISREG(db_stat.st_mode):
                raise RuntimeError("hall_store_not_regular_file")
            if db_stat.st_nlink != 1:
                raise RuntimeError("hall_store_hardlink_forbidden")
        return db_path, db_stat

    def connect(self) -> sqlite3.Connection:
        db_path, prior_stat = self._resolve_store_path()
        conn = sqlite3.connect(db_path, timeout=self.BUSY_TIMEOUT_MS / 1000)
        current_stat = db_path.lstat()
        if (
            not stat.S_ISREG(current_stat.st_mode)
            or current_stat.st_nlink != 1
            or (
                prior_stat is not None
                and (current_stat.st_dev, current_stat.st_ino)
                != (prior_stat.st_dev, prior_stat.st_ino)
            )
        ):
            conn.close()
            raise RuntimeError("hall_store_identity_changed")
        if prior_stat is None:
            db_path.chmod(0o600)
        conn.row_factory = sqlite3.Row
        # Configure SQLite for concurrent read/write workloads on the Hall DB.
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(f"PRAGMA busy_timeout={self.BUSY_TIMEOUT_MS}")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def ensure_schema(self) -> None:
        with self.connect() as conn:
            conn.executescript(
                """
                BEGIN IMMEDIATE;

                CREATE TABLE IF NOT EXISTS hall_repositories (
                    repo_id TEXT PRIMARY KEY,
                    root_path TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'DORMANT',
                    active_persona TEXT NOT NULL DEFAULT '',
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
                    imports_json TEXT,
                    exports_json TEXT,
                    intent_summary TEXT,
                    interaction_summary TEXT,
                    created_at INTEGER NOT NULL,
                    UNIQUE(scan_id, path),
                    FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
                    FOREIGN KEY(scan_id) REFERENCES hall_scans(scan_id)
                );

                CREATE INDEX IF NOT EXISTS idx_hall_files_repo_path ON hall_files(repo_id, path);

                CREATE TABLE IF NOT EXISTS hall_episodic_memory (
                    memory_id TEXT PRIMARY KEY,
                    bead_id TEXT NOT NULL,
                    repo_id TEXT NOT NULL,
                    tactical_summary TEXT NOT NULL,
                    files_touched_json TEXT,
                    successes_json TEXT,
                    metadata_json TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id),
                    FOREIGN KEY(bead_id) REFERENCES hall_beads(bead_id)
                );

                CREATE INDEX IF NOT EXISTS idx_hall_episodic_memory_repo
                ON hall_episodic_memory(repo_id, created_at);

                CREATE INDEX IF NOT EXISTS idx_hall_episodic_memory_bead
                ON hall_episodic_memory(bead_id, created_at);

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
                    checker_shell TEXT,
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
                    architect_opinion TEXT,
                    current_bead_id TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    metadata_json TEXT,
                    FOREIGN KEY(repo_id) REFERENCES hall_repositories(repo_id)
                );

                CREATE INDEX IF NOT EXISTS idx_hall_planning_repo
                ON hall_planning_sessions(repo_id, updated_at);
                """
            )
            self._ensure_column(conn, "hall_beads", "target_kind", "TEXT NOT NULL DEFAULT 'FILE'")
            self._ensure_column(conn, "hall_beads", "target_ref", "TEXT")
            self._ensure_column(conn, "hall_beads", "source_kind", "TEXT")
            self._ensure_column(conn, "hall_beads", "triage_reason", "TEXT")
            self._ensure_column(conn, "hall_beads", "resolution_note", "TEXT")
            self._ensure_column(conn, "hall_beads", "resolved_validation_id", "TEXT")
            self._ensure_column(conn, "hall_beads", "checker_shell", "TEXT")
            self._ensure_column(conn, "hall_beads", "superseded_by", "TEXT")
            self._ensure_column(conn, "hall_files", "imports_json", "TEXT")
            self._ensure_column(conn, "hall_files", "exports_json", "TEXT")
            self._ensure_column(conn, "hall_skill_proposals", "summary", "TEXT")
            self._ensure_column(conn, "hall_skill_proposals", "promotion_note", "TEXT")
            self._ensure_column(conn, "hall_skill_proposals", "promoted_at", "INTEGER")
            self._ensure_column(conn, "hall_skill_proposals", "promoted_by", "TEXT")
            self._ensure_column(conn, "hall_skill_proposals", "metadata_json", "TEXT")
            self._ensure_column(conn, "hall_planning_sessions", "summary", "TEXT")
            self._ensure_column(conn, "hall_planning_sessions", "latest_question", "TEXT")
            self._ensure_column(conn, "hall_planning_sessions", "architect_opinion", "TEXT")
            self._ensure_column(conn, "hall_planning_sessions", "current_bead_id", "TEXT")
            self._ensure_column(conn, "hall_planning_sessions", "metadata_json", "TEXT")
            conn.execute("DROP VIEW IF EXISTS hall_repository_projection")
            conn.execute(
                """
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
                          AND b.status IN ('OPEN', 'SET-PENDING', 'SET', 'IN_PROGRESS', 'READY_FOR_REVIEW')
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
                FROM hall_repositories r
                """
            )

    def bootstrap_repository(self) -> HallRepositoryRecord:
        self.ensure_schema()
        existing = self.get_repository_record()
        if existing is not None:
            return existing

        now = self._now()
        repo = HallRepositoryRecord(
            repo_id=build_repo_id(self.project_root),
            root_path=normalize_hall_path(self.project_root),
            name=self.project_root.name,
            status="DORMANT",
            active_persona="",
            baseline_gungnir_score=0,
            intent_integrity=0,
            metadata={"source": "hall-schema-bootstrap"},
            created_at=now,
            updated_at=now,
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
                    matrix_json, imports_json, exports_json, intent_summary, interaction_summary, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(scan_id, path) DO UPDATE SET
                    content_hash = excluded.content_hash,
                    language = excluded.language,
                    gungnir_score = excluded.gungnir_score,
                    matrix_json = excluded.matrix_json,
                    imports_json = excluded.imports_json,
                    exports_json = excluded.exports_json,
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
                    json.dumps(record.imports),
                    json.dumps(record.exports),
                    record.intent_summary,
                    record.interaction_summary,
                    record.created_at,
                ),
            )

    @staticmethod
    def _table_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
        rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        return {row["name"] for row in rows}

    @staticmethod
    def _ensure_column(conn: sqlite3.Connection, table_name: str, column_name: str, column_sql: str) -> None:
        if column_name in HallSchemaCoreMixin._table_columns(conn, table_name):
            return
        conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}")

    @staticmethod
    @staticmethod
    def _now() -> int:
        return int(__import__("time").time() * 1000)
