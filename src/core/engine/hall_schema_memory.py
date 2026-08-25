from __future__ import annotations

import json
import sqlite3

from .hall_records import (
    HallBeadRecord,
    HallEpisodicMemoryRecord,
    HallFileRecord,
    HallSkillObservation,
    HallValidationRun,
    build_repo_id,
    normalize_hall_path,
)

class HallSchemaMemoryMixin:
    def get_file(self, file_path: str, scan_id: str | None = None) -> HallFileRecord | None:
        self.ensure_schema()
        repo_id = build_repo_id(self.project_root)
        normalized_path = normalize_hall_path(file_path)
        with self.connect() as conn:
            row = (
                conn.execute(
                    """
                    SELECT repo_id, scan_id, path, content_hash, language, gungnir_score,
                           matrix_json, imports_json, exports_json, intent_summary, interaction_summary, created_at
                    FROM hall_files
                    WHERE repo_id = ? AND scan_id = ? AND path = ?
                    LIMIT 1
                    """,
                    (repo_id, scan_id, normalized_path),
                ).fetchone()
                if scan_id is not None
                else conn.execute(
                    """
                    SELECT repo_id, scan_id, path, content_hash, language, gungnir_score,
                           matrix_json, imports_json, exports_json, intent_summary, interaction_summary, created_at
                    FROM hall_files
                    WHERE repo_id = ? AND path = ?
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (repo_id, normalized_path),
                ).fetchone()
            )
        return self._hall_file_from_row(row)

    def list_files(self, scan_id: str | None = None) -> list[HallFileRecord]:
        self.ensure_schema()
        repo_id = build_repo_id(self.project_root)
        with self.connect() as conn:
            rows = (
                conn.execute(
                    """
                    SELECT repo_id, scan_id, path, content_hash, language, gungnir_score,
                           matrix_json, imports_json, exports_json, intent_summary, interaction_summary, created_at
                    FROM hall_files
                    WHERE repo_id = ? AND scan_id = ?
                    ORDER BY path ASC
                    """,
                    (repo_id, scan_id),
                ).fetchall()
                if scan_id is not None
                else conn.execute(
                    """
                    SELECT repo_id, scan_id, path, content_hash, language, gungnir_score,
                           matrix_json, imports_json, exports_json, intent_summary, interaction_summary, created_at
                    FROM hall_files
                    WHERE repo_id = ?
                    ORDER BY path ASC
                    """,
                    (repo_id,),
                ).fetchall()
            )
        return [record for row in rows if (record := self._hall_file_from_row(row)) is not None]

    def save_episodic_memory(self, record: HallEpisodicMemoryRecord) -> None:
        self.ensure_schema()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO hall_episodic_memory (
                    memory_id, bead_id, repo_id, tactical_summary, files_touched_json,
                    successes_json, metadata_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(memory_id) DO UPDATE SET
                    tactical_summary = excluded.tactical_summary,
                    files_touched_json = excluded.files_touched_json,
                    successes_json = excluded.successes_json,
                    metadata_json = excluded.metadata_json,
                    updated_at = excluded.updated_at
                """,
                (
                    record.memory_id,
                    record.bead_id,
                    record.repo_id,
                    record.tactical_summary,
                    json.dumps(record.files_touched),
                    json.dumps(record.successes),
                    json.dumps(record.metadata),
                    record.created_at,
                    record.updated_at,
                ),
            )

    def get_episodic_memory(self, memory_id: str) -> HallEpisodicMemoryRecord | None:
        self.ensure_schema()
        repo_id = build_repo_id(self.project_root)
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT memory_id, bead_id, repo_id, tactical_summary, files_touched_json,
                       successes_json, metadata_json, created_at, updated_at
                FROM hall_episodic_memory
                WHERE repo_id = ? AND memory_id = ?
                LIMIT 1
                """,
                (repo_id, memory_id),
            ).fetchone()
        return self._hall_episodic_memory_from_row(row)

    def list_episodic_memory(self, bead_id: str | None = None) -> list[HallEpisodicMemoryRecord]:
        self.ensure_schema()
        repo_id = build_repo_id(self.project_root)
        with self.connect() as conn:
            rows = (
                conn.execute(
                    """
                    SELECT memory_id, bead_id, repo_id, tactical_summary, files_touched_json,
                           successes_json, metadata_json, created_at, updated_at
                    FROM hall_episodic_memory
                    WHERE repo_id = ? AND bead_id = ?
                    ORDER BY created_at ASC
                    """,
                    (repo_id, bead_id),
                ).fetchall()
                if bead_id is not None
                else conn.execute(
                    """
                    SELECT memory_id, bead_id, repo_id, tactical_summary, files_touched_json,
                           successes_json, metadata_json, created_at, updated_at
                    FROM hall_episodic_memory
                    WHERE repo_id = ?
                    ORDER BY created_at ASC
                    """,
                    (repo_id,),
                ).fetchall()
            )
        return [record for row in rows if (record := self._hall_episodic_memory_from_row(row)) is not None]

    def upsert_bead(self, record: HallBeadRecord) -> None:
        self.ensure_schema()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO hall_beads (
                    bead_id, repo_id, scan_id, legacy_id, target_kind, target_ref, target_path, rationale, contract_refs_json,
                    baseline_scores_json, acceptance_criteria, checker_shell, status, assigned_agent, source_kind, triage_reason,
                    resolution_note, resolved_validation_id, superseded_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    checker_shell = COALESCE(excluded.checker_shell, hall_beads.checker_shell),
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
                    record.checker_shell,
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

    @staticmethod
    def _hall_file_from_row(row: sqlite3.Row | None) -> HallFileRecord | None:
        if row is None:
            return None
        return HallFileRecord(
            repo_id=str(row["repo_id"]),
            scan_id=str(row["scan_id"]),
            path=str(row["path"]),
            created_at=int(row["created_at"] or 0),
            content_hash=str(row["content_hash"]) if row["content_hash"] is not None else None,
            language=str(row["language"]) if row["language"] is not None else None,
            gungnir_score=float(row["gungnir_score"] or 0),
            matrix=json.loads(row["matrix_json"] or "{}"),
            imports=json.loads(row["imports_json"] or "[]"),
            exports=json.loads(row["exports_json"] or "[]"),
            intent_summary=str(row["intent_summary"]) if row["intent_summary"] is not None else None,
            interaction_summary=str(row["interaction_summary"]) if row["interaction_summary"] is not None else None,
        )

    @staticmethod
    def _hall_episodic_memory_from_row(row: sqlite3.Row | None) -> HallEpisodicMemoryRecord | None:
        if row is None:
            return None
        return HallEpisodicMemoryRecord(
            memory_id=str(row["memory_id"]),
            bead_id=str(row["bead_id"]),
            repo_id=str(row["repo_id"]),
            tactical_summary=str(row["tactical_summary"]),
            created_at=int(row["created_at"] or 0),
            updated_at=int(row["updated_at"] or 0),
            files_touched=json.loads(row["files_touched_json"] or "[]"),
            successes=json.loads(row["successes_json"] or "[]"),
            metadata=json.loads(row["metadata_json"] or "{}"),
        )
