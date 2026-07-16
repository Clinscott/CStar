from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .hall_records import (
    HallRepositoryRecord,
    HallSkillProposalRecord,
    HallSkillProposalStatus,
    HallValidationRun,
    build_repo_id,
    is_persona_projection_self_consistent,
    normalize_hall_path,
)

class HallSchemaSkillMixin:
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
            if row is None:
                return None
            summary = dict(row)
            repository = self.get_repository_record(repo_path)
            if repository is None or not is_persona_projection_self_consistent(
                repository.metadata,
                repository.active_persona,
            ):
                summary["active_persona"] = ""
            return summary
