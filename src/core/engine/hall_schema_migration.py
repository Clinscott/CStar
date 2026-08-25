from __future__ import annotations

from .hall_records import (
    HallBeadRecord,
    HallScanRecord,
    HallValidationRun,
    is_persona_projection_self_consistent,
)

class HallSchemaMigrationMixin:
    def migrate_legacy_records(self) -> dict[str, int]:
        self.ensure_schema()
        repo = self.bootstrap_repository()
        if repo.active_persona and not is_persona_projection_self_consistent(
            repo.metadata,
            repo.active_persona,
        ):
            repo.active_persona = ""
            repo.metadata = {"source": "migration"}
            self.upsert_repository(repo)
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
