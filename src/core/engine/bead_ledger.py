from __future__ import annotations

import json
import re
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence

from src.core.engine.hall_schema import HallBeadRecord, HallOfRecords, normalize_hall_path

PROJECTION_STATUS_ORDER = ("OPEN", "SET-PENDING", "SET", "IN_PROGRESS", "READY_FOR_REVIEW", "NEEDS_TRIAGE", "BLOCKED", "RESOLVED", "ARCHIVED", "SUPERSEDED")
PROJECTION_MARKERS = {
    "OPEN": "[ ]",
    "SET-PENDING": "[P]",
    "SET": "[S]",
    "IN_PROGRESS": "[/]",
    "READY_FOR_REVIEW": "[>]",
    "NEEDS_TRIAGE": "[?]",
    "BLOCKED": "[!]",
    "RESOLVED": "[x]",
    "ARCHIVED": "[-]",
    "SUPERSEDED": "[~]",
}
NON_EXECUTABLE_CONTRACT_PREFIXES = ("lore:", "workflow:", "registry:")
SYSTEM_TELEMETRY_PREFIXES = ("Mission execution:", "Execution of ")


def _normalize_contract_ref(ref: Any) -> str | None:
    value = str(ref or "").strip()
    return value or None


def _normalized_contract_refs(contract_refs: Sequence[str] | None) -> tuple[str, ...]:
    normalized = {_normalize_contract_ref(ref) for ref in (contract_refs or [])}
    return tuple(sorted(ref for ref in normalized if ref))


def _has_executable_contract_refs(contract_refs: Sequence[str] | None) -> bool:
    for ref in _normalized_contract_refs(contract_refs):
        if not ref.lower().startswith(NON_EXECUTABLE_CONTRACT_PREFIXES):
            return True
    return False


@dataclass(slots=True)
class SovereignBead:
    id: str
    repo_id: str
    scan_id: str
    rationale: str
    created_at: int
    updated_at: int
    target_kind: str = "FILE"
    target_ref: str | None = None
    target_path: str | None = None
    contract_refs: list[str] = field(default_factory=list)
    baseline_scores: dict[str, Any] = field(default_factory=dict)
    acceptance_criteria: str | None = None
    checker_shell: str | None = None
    status: str = "OPEN"
    assigned_agent: str | None = None
    legacy_id: int | None = None
    source_kind: str | None = None
    triage_reason: str | None = None
    resolution_note: str | None = None
    resolved_validation_id: str | None = None
    superseded_by: str | None = None

    def to_record(self) -> HallBeadRecord:
        return HallBeadRecord(
            bead_id=self.id,
            repo_id=self.repo_id,
            scan_id=self.scan_id,
            legacy_id=self.legacy_id,
            target_kind=self.target_kind,
            target_ref=self.target_ref,
            target_path=self.target_path,
            rationale=self.rationale,
            contract_refs=self.contract_refs,
            baseline_scores=self.baseline_scores,
            acceptance_criteria=self.acceptance_criteria,
            checker_shell=self.checker_shell,
            status=self.status,
            assigned_agent=self.assigned_agent,
            source_kind=self.source_kind,
            triage_reason=self.triage_reason,
            resolution_note=self.resolution_note,
            resolved_validation_id=self.resolved_validation_id,
            superseded_by=self.superseded_by,
            created_at=self.created_at,
            updated_at=self.updated_at,
        )

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "repo_id": self.repo_id,
            "scan_id": self.scan_id,
            "target_kind": self.target_kind,
            "target_ref": self.target_ref,
            "target_path": self.target_path,
            "actionable": self._is_claimable_public(),
            "rationale": self.rationale,
            "description": self.rationale,
            "contract_refs": list(self.contract_refs),
            "baseline_scores": dict(self.baseline_scores),
            "acceptance_criteria": self.acceptance_criteria,
            "checker_shell": self.checker_shell,
            "status": self.status,
            "assigned_agent": self.assigned_agent,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "legacy_id": self.legacy_id,
            "source_kind": self.source_kind,
            "triage_reason": self.triage_reason,
            "resolution_note": self.resolution_note,
            "resolved_validation_id": self.resolved_validation_id,
            "superseded_by": self.superseded_by,
        }

    def _is_claimable_public(self) -> bool:
        return bool(
            (self.target_path or self.target_ref)
            and self.acceptance_criteria
            and _has_executable_contract_refs(self.contract_refs)
        )


class BeadLedger:
    """Canonical Hall-backed sovereign bead system with a `tasks.qmd` projection."""

    def __init__(self, project_root: Path | str):
        self.project_root = Path(project_root)
        self.hall = HallOfRecords(self.project_root)
        self.repository = self.hall.bootstrap_repository()
        self.tasks_file = self.project_root / "tasks.qmd"

    def connect(self):
        return self.hall.connect()

    def list_beads(self, statuses: Sequence[str] | None = None) -> list[SovereignBead]:
        self.normalize_existing_beads()
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM hall_beads WHERE repo_id = ?",
                (self.repository.repo_id,),
            ).fetchall()
        beads = [self._row_to_bead(row) for row in rows]
        if statuses is not None:
            allowed = set(statuses)
            beads = [bead for bead in beads if bead.status in allowed]
        return sorted(beads, key=self._sort_key)

    def peek_next_bead(self) -> dict[str, Any] | None:
        actionable_beads = self._list_actionable_beads(statuses=("SET", "OPEN"))
        if not actionable_beads:
            return None
        return sorted(actionable_beads, key=self._claim_sort_key)[0].to_public_dict()

    def claim_next_bead(self, agent_id: str) -> dict[str, Any] | None:
        self.normalize_existing_beads()
        with self.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            bead = self._select_next_claimable_bead(conn)
            if bead is None:
                return None
            claimed = self._claim_bead_in_transaction(conn, bead, agent_id)

        self.sync_tasks_projection()
        return claimed.to_public_dict() if claimed else None

    def claim_bead(self, bead_id: str | int, agent_id: str) -> SovereignBead | None:
        self.normalize_existing_beads()
        with self.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            bead = self._get_bead_for_update(conn, bead_id)
            if bead is None or bead.status not in {"OPEN", "SET"} or not self._is_claimable(bead):
                return None
            claimed = self._claim_bead_in_transaction(conn, bead, agent_id)

        self.sync_tasks_projection()
        return claimed

    def mark_ready_for_review(self, bead_id: str | int, resolution_note: str | None = None) -> SovereignBead | None:
        bead = self.get_bead(bead_id)
        if bead is None:
            return None
        if bead.status != "IN_PROGRESS":
            return None

        bead.status = "READY_FOR_REVIEW"
        bead.updated_at = self._now()
        bead.resolution_note = resolution_note or bead.resolution_note

        with self.connect() as conn:
            self._upsert_record(conn, bead.to_record())

        self.sync_tasks_projection()
        return bead

    def block_bead(
        self,
        bead_id: str | int,
        triage_reason: str,
        *,
        resolution_note: str | None = None,
    ) -> SovereignBead | None:
        bead = self.get_bead(bead_id)
        if bead is None:
            return None
        if bead.status in {"RESOLVED", "ARCHIVED", "SUPERSEDED"}:
            return None

        bead.status = "BLOCKED"
        bead.assigned_agent = None
        bead.updated_at = self._now()
        bead.triage_reason = triage_reason
        bead.resolution_note = resolution_note or bead.resolution_note

        with self.connect() as conn:
            self._upsert_record(conn, bead.to_record())

        self.sync_tasks_projection()
        return bead

    def resolve_bead(
        self,
        bead_id: str | int,
        *,
        validation_id: str | None = None,
        resolution_note: str | None = None,
    ) -> SovereignBead | None:
        bead = self.get_bead(bead_id)
        if bead is None:
            return None
        if bead.status not in ("IN_PROGRESS", "READY_FOR_REVIEW"):
            return None

        with self.connect() as conn:
            resolved_validation_id = self._find_accepted_validation_id(conn, bead.id, validation_id)
            if resolved_validation_id is None:
                return None
            bead.status = "RESOLVED"
            bead.updated_at = self._now()
            bead.resolution_note = resolution_note or bead.resolution_note
            bead.resolved_validation_id = resolved_validation_id
            self._upsert_record(conn, bead.to_record())

        self.sync_tasks_projection()
        return bead

    def get_bead(self, bead_id: str | int) -> SovereignBead | None:
        with self.connect() as conn:
            if isinstance(bead_id, int):
                row = conn.execute(
                    "SELECT * FROM hall_beads WHERE repo_id = ? AND legacy_id = ?",
                    (self.repository.repo_id, bead_id),
                ).fetchone()
            else:
                row = conn.execute(
                    "SELECT * FROM hall_beads WHERE repo_id = ? AND bead_id = ?",
                    (self.repository.repo_id, str(bead_id)),
                ).fetchone()
        return self._row_to_bead(row) if row else None

    def upsert_bead(
        self,
        *,
        bead_id: str | None = None,
        scan_id: str | None = None,
        target_kind: str | None = None,
        target_ref: str | None = None,
        target_path: str | Path | None = None,
        rationale: str,
        contract_refs: Sequence[str] | None = None,
        baseline_scores: dict[str, Any] | None = None,
        acceptance_criteria: str | None = None,
        status: str = "OPEN",
        assigned_agent: str | None = None,
        created_at: int | None = None,
        updated_at: int | None = None,
        legacy_id: int | None = None,
        source_kind: str | None = None,
        triage_reason: str | None = None,
        resolution_note: str | None = None,
        resolved_validation_id: str | None = None,
        superseded_by: str | None = None,
    ) -> SovereignBead:
        normalized_path = normalize_hall_path(target_path) if target_path else None
        materialized_kind = self._normalize_target_kind(target_kind, normalized_path)
        materialized_ref = self._normalize_target_ref(materialized_kind, target_ref, normalized_path)
        now = self._now()

        with self.connect() as conn:
            existing = self._find_active_duplicate(
                conn,
                materialized_kind,
                materialized_ref,
                normalized_path,
                rationale,
                contract_refs,
                acceptance_criteria,
            )
            if existing and bead_id is None:
                bead_id = str(existing["bead_id"])
                created_at = int(existing["created_at"])
                legacy_id = existing["legacy_id"]
                if status == "OPEN":
                    status = str(existing["status"])
                if assigned_agent is None:
                    assigned_agent = existing["assigned_agent"]
                if source_kind is None:
                    source_kind = existing["source_kind"]
                if triage_reason is None:
                    triage_reason = existing["triage_reason"]
                if resolution_note is None:
                    resolution_note = existing["resolution_note"]
                if resolved_validation_id is None:
                    resolved_validation_id = existing["resolved_validation_id"]
                if superseded_by is None:
                    superseded_by = existing["superseded_by"]
                baseline_scores = self._merge_scores(
                    self._parse_json(existing["baseline_scores_json"], {}),
                    baseline_scores,
                )

            bead = SovereignBead(
                id=bead_id or self._new_bead_id(),
                repo_id=self.repository.repo_id,
                scan_id=scan_id or "",
                target_kind=materialized_kind,
                target_ref=materialized_ref,
                target_path=normalized_path,
                rationale=rationale,
                contract_refs=list(contract_refs or []),
                baseline_scores=dict(baseline_scores or {}),
                acceptance_criteria=acceptance_criteria,
                status=status,
                assigned_agent=assigned_agent,
                created_at=created_at or now,
                updated_at=updated_at or now,
                legacy_id=legacy_id,
                source_kind=source_kind,
                triage_reason=triage_reason,
                resolution_note=resolution_note,
                resolved_validation_id=resolved_validation_id,
                superseded_by=superseded_by,
            )
            materialized = self._normalize_materialized_bead(conn, self._materialize_bead(conn, bead))
            self._upsert_record(conn, materialized.to_record())

        self.sync_tasks_projection()
        return materialized

    def normalize_existing_beads(self) -> int:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM hall_beads WHERE repo_id = ?",
                (self.repository.repo_id,),
            ).fetchall()

            updates: list[SovereignBead] = []
            normalized_beads: list[tuple[SovereignBead, SovereignBead]] = []
            for row in rows:
                original = self._row_to_bead(row)
                materialized = self._materialize_bead(conn, original)
                normalized = self._normalize_materialized_bead(conn, materialized)
                normalized_beads.append((original, normalized))

            superseded = self._apply_legacy_supersession([bead for _, bead in normalized_beads])
            for original, normalized in zip((original for original, _ in normalized_beads), superseded, strict=False):
                if (
                    normalized.scan_id != original.scan_id
                    or normalized.target_kind != original.target_kind
                    or normalized.target_ref != original.target_ref
                    or normalized.target_path != original.target_path
                    or normalized.baseline_scores != original.baseline_scores
                    or normalized.acceptance_criteria != original.acceptance_criteria
                    or normalized.status != original.status
                    or normalized.source_kind != original.source_kind
                    or normalized.triage_reason != original.triage_reason
                    or normalized.resolution_note != original.resolution_note
                    or normalized.resolved_validation_id != original.resolved_validation_id
                    or normalized.superseded_by != original.superseded_by
                ):
                    updates.append(normalized)

            for bead in updates:
                self._upsert_record(conn, bead.to_record())

        return len(updates)

    def render_tasks_projection(self) -> str:
        beads = self.list_beads()
        projection_timestamp = max((bead.updated_at for bead in beads), default=self.repository.updated_at)
        generated_at = (
            time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(projection_timestamp / 1000))
            if projection_timestamp
            else "1970-01-01 00:00:00"
        )
        lines = [
            "---",
            'title: "Sovereign Bead System"',
            f'generated_at: "{generated_at}"',
            'authoritative_source: "hall_beads"',
            "---",
            "",
            "# Sovereign Bead System",
            "",
            "`tasks.qmd` is a projection of the Hall of Records. Do not edit bead state here.",
            "",
            f"- Repository: `{self.repository.repo_id}`",
            f"- Open Beads: `{sum(1 for bead in beads if bead.status == 'OPEN')}`",
            f"- Set Pending: `{sum(1 for bead in beads if bead.status == 'SET-PENDING')}`",
            f"- Set Beads: `{sum(1 for bead in beads if bead.status == 'SET')}`",
            f"- In Progress: `{sum(1 for bead in beads if bead.status == 'IN_PROGRESS')}`",
            f"- Ready For Review: `{sum(1 for bead in beads if bead.status == 'READY_FOR_REVIEW')}`",
            f"- Needs Triage: `{sum(1 for bead in beads if bead.status == 'NEEDS_TRIAGE')}`",
            f"- Blocked: `{sum(1 for bead in beads if bead.status == 'BLOCKED')}`",
            f"- Resolved: `{sum(1 for bead in beads if bead.status == 'RESOLVED')}`",
            f"- Archived: `{sum(1 for bead in beads if bead.status == 'ARCHIVED')}`",
            f"- Superseded: `{sum(1 for bead in beads if bead.status == 'SUPERSEDED')}`",
            "",
        ]

        for status in PROJECTION_STATUS_ORDER:
            section_beads = [bead for bead in beads if bead.status == status]
            lines.append(f"## {self._section_title(status)}")
            if section_beads:
                for bead in section_beads:
                    lines.append(self._format_projection_line(bead))
            else:
                lines.append("- None")
            lines.append("")

        return "\n".join(lines).rstrip() + "\n"

    def sync_tasks_projection(self) -> int:
        content = self.render_tasks_projection()
        self.tasks_file.write_text(content, encoding="utf-8")
        return len(self.list_beads(statuses=("OPEN", "IN_PROGRESS", "READY_FOR_REVIEW")))

    def projection_matches(self) -> bool:
        expected = self.render_tasks_projection()
        if not self.tasks_file.exists():
            return False
        return self.tasks_file.read_text(encoding="utf-8") == expected

    def find_projection_line(self, bead_id: str) -> int | None:
        self.sync_tasks_projection()
        if not self.tasks_file.exists():
            return None

        for index, line in enumerate(self.tasks_file.read_text(encoding="utf-8").splitlines()):
            if f"[{bead_id}]" in line:
                return index
        return None

    def _materialize_bead(self, conn, bead: SovereignBead) -> SovereignBead:
        scan_ref = self._resolve_scan_reference(conn, bead.target_path, bead.scan_id or None)
        normalized_kind = self._normalize_target_kind(bead.target_kind, bead.target_path)
        return SovereignBead(
            id=bead.id,
            repo_id=bead.repo_id,
            scan_id=str(scan_ref["scan_id"]),
            target_kind=normalized_kind,
            target_ref=self._normalize_target_ref(normalized_kind, bead.target_ref, bead.target_path),
            target_path=bead.target_path,
            rationale=bead.rationale,
            contract_refs=list(bead.contract_refs),
            baseline_scores=self._resolve_baseline_scores(
                conn,
                target_path=bead.target_path,
                scan_id=str(scan_ref["scan_id"]),
                existing=bead.baseline_scores,
            ),
            acceptance_criteria=bead.acceptance_criteria,
            status=bead.status,
            assigned_agent=bead.assigned_agent,
            created_at=bead.created_at,
            updated_at=bead.updated_at,
            legacy_id=bead.legacy_id,
            source_kind=bead.source_kind,
            triage_reason=bead.triage_reason,
            resolution_note=bead.resolution_note,
            resolved_validation_id=bead.resolved_validation_id,
            superseded_by=bead.superseded_by,
        )

    def _list_actionable_beads(self, statuses: Sequence[str] | None = None) -> list[SovereignBead]:
        beads = self.list_beads(statuses=statuses)
        return [bead for bead in beads if self._is_claimable(bead)]

    def _select_next_claimable_bead(self, conn) -> SovereignBead | None:
        rows = conn.execute(
            """
            SELECT * FROM hall_beads
            WHERE repo_id = ? AND status IN ('SET', 'OPEN')
            """,
            (self.repository.repo_id,),
        ).fetchall()
        beads = sorted(
            (self._row_to_bead(row) for row in rows if self._is_claimable(self._row_to_bead(row))),
            key=self._claim_sort_key,
        )
        return beads[0] if beads else None

    def _get_bead_for_update(self, conn, bead_id: str | int) -> SovereignBead | None:
        if isinstance(bead_id, int):
            row = conn.execute(
                "SELECT * FROM hall_beads WHERE repo_id = ? AND legacy_id = ?",
                (self.repository.repo_id, bead_id),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT * FROM hall_beads WHERE repo_id = ? AND bead_id = ?",
                (self.repository.repo_id, str(bead_id)),
            ).fetchone()
        return self._row_to_bead(row) if row else None

    def _claim_bead_in_transaction(self, conn, bead: SovereignBead, agent_id: str) -> SovereignBead | None:
        updated_at = self._now()
        result = conn.execute(
            """
            UPDATE hall_beads
            SET status = 'IN_PROGRESS', assigned_agent = ?, updated_at = ?
            WHERE bead_id = ? AND repo_id = ? AND status IN ('SET', 'OPEN')
            """,
            (agent_id, updated_at, bead.id, self.repository.repo_id),
        )
        if result.rowcount != 1:
            return None
        bead.status = "IN_PROGRESS"
        bead.assigned_agent = agent_id
        bead.updated_at = updated_at
        return bead

    def _resolve_scan_reference(self, conn, target_path: str | None, scan_id: str | None) -> dict[str, Any]:
        if scan_id:
            row = conn.execute(
                """
                SELECT scan_id, baseline_gungnir_score
                FROM hall_scans
                WHERE repo_id = ? AND scan_id = ?
                """,
                (self.repository.repo_id, scan_id),
            ).fetchone()
            if row:
                return dict(row)

        if target_path:
            row = conn.execute(
                """
                SELECT f.scan_id, s.baseline_gungnir_score
                FROM hall_files f
                JOIN hall_scans s ON s.scan_id = f.scan_id
                WHERE f.repo_id = ? AND f.path = ?
                ORDER BY f.created_at DESC
                LIMIT 1
                """,
                (self.repository.repo_id, target_path),
            ).fetchone()
            if row:
                return dict(row)

        row = conn.execute(
            """
            SELECT scan_id, baseline_gungnir_score
            FROM hall_scans
            WHERE repo_id = ?
            ORDER BY COALESCE(completed_at, started_at) DESC
            LIMIT 1
            """,
            (self.repository.repo_id,),
        ).fetchone()
        if row:
            return dict(row)

        return self._create_fallback_scan(conn)

    def _resolve_baseline_scores(
        self,
        conn,
        *,
        target_path: str | None,
        scan_id: str,
        existing: dict[str, Any] | None,
    ) -> dict[str, Any]:
        scores = dict(existing or {})
        repo_row = conn.execute(
            "SELECT baseline_gungnir_score FROM hall_repositories WHERE repo_id = ?",
            (self.repository.repo_id,),
        ).fetchone()
        scan_row = conn.execute(
            "SELECT baseline_gungnir_score FROM hall_scans WHERE repo_id = ? AND scan_id = ?",
            (self.repository.repo_id, scan_id),
        ).fetchone()

        if repo_row:
            scores.setdefault("repository_baseline", float(repo_row["baseline_gungnir_score"] or 0))
        if scan_row:
            scores.setdefault("scan_id", scan_id)
            scores.setdefault("scan_baseline", float(scan_row["baseline_gungnir_score"] or 0))

        file_row = None
        if target_path:
            file_row = conn.execute(
                """
                SELECT matrix_json, gungnir_score
                FROM hall_files
                WHERE repo_id = ? AND scan_id = ? AND path = ?
                LIMIT 1
                """,
                (self.repository.repo_id, scan_id, target_path),
            ).fetchone()
            if file_row is None:
                file_row = conn.execute(
                    """
                    SELECT matrix_json, gungnir_score
                    FROM hall_files
                    WHERE repo_id = ? AND path = ?
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (self.repository.repo_id, target_path),
                ).fetchone()

        if file_row:
            matrix = self._parse_json(file_row["matrix_json"], {})
            scores.setdefault("matrix", matrix)
            scores.setdefault("file_gungnir_score", float(file_row["gungnir_score"] or 0))
            scores.setdefault(
                "overall",
                float(
                    file_row["gungnir_score"]
                    or matrix.get("overall")
                    or scores.get("scan_baseline")
                    or scores.get("repository_baseline")
                    or 0
                ),
            )
            scores.setdefault("source", "hall_files")
        else:
            scores.setdefault(
                "overall",
                float(scores.get("scan_baseline") or scores.get("repository_baseline") or 0),
            )
            scores.setdefault("source", "hall_scans")

        if target_path:
            scores.setdefault("target_path", target_path)

        return scores

    def _create_fallback_scan(self, conn) -> dict[str, Any]:
        now = self._now()
        scan_id = f"scan:bead-baseline:{now}"
        repo_row = conn.execute(
            "SELECT baseline_gungnir_score FROM hall_repositories WHERE repo_id = ?",
            (self.repository.repo_id,),
        ).fetchone()
        baseline = float(repo_row["baseline_gungnir_score"] or 0) if repo_row else 0.0
        conn.execute(
            """
            INSERT INTO hall_scans (
                scan_id, repo_id, scan_kind, status, baseline_gungnir_score, started_at, completed_at, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                scan_id,
                self.repository.repo_id,
                "bead_projection",
                "COMPLETED",
                baseline,
                now,
                now,
                json.dumps({"source": "sovereign_bead_system"}),
            ),
        )
        return {"scan_id": scan_id, "baseline_gungnir_score": baseline}

    def _find_active_duplicate(
        self,
        conn,
        target_kind: str,
        target_ref: str | None,
        target_path: str | None,
        rationale: str,
        contract_refs: Sequence[str] | None,
        acceptance_criteria: str | None,
    ):
        rows = conn.execute(
            """
            SELECT * FROM hall_beads
            WHERE repo_id = ? AND status IN ('OPEN', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'NEEDS_TRIAGE', 'BLOCKED')
              AND (
                rationale = ?
                OR (? IS NOT NULL AND target_ref = ?)
                OR (? IS NOT NULL AND target_path = ?)
              )
            ORDER BY updated_at DESC
            """,
            (self.repository.repo_id, rationale, target_ref, target_ref, target_path, target_path),
        ).fetchall()
        wanted_contracts = self._normalized_contract_refs(contract_refs)
        for row in rows:
            row_kind = str(row["target_kind"] or "FILE")
            row_ref = str(row["target_ref"]) if row["target_ref"] else None
            row_target = str(row["target_path"]) if row["target_path"] else None
            if row_ref is None and row_kind == "FILE" and row_target is not None:
                row_ref = row_target
            row_rationale = str(row["rationale"])
            row_acceptance = str(row["acceptance_criteria"]) if row["acceptance_criteria"] else None
            row_contracts = self._normalized_contract_refs(self._parse_json(row["contract_refs_json"], []))
            if row_kind != target_kind:
                continue
            if row_ref != target_ref:
                continue
            if row_target != target_path:
                continue
            if row_rationale != rationale:
                continue
            if row_acceptance != acceptance_criteria:
                continue
            if row_contracts != wanted_contracts:
                continue
            return row
        return None

    def _upsert_record(self, conn, record: HallBeadRecord) -> None:
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

    def _row_to_bead(self, row) -> SovereignBead:
        return SovereignBead(
            id=str(row["bead_id"]),
            repo_id=str(row["repo_id"]),
            scan_id=str(row["scan_id"] or ""),
            target_kind=str(row["target_kind"] or ("FILE" if row["target_path"] else "OTHER")),
            target_ref=str(row["target_ref"]) if row["target_ref"] else None,
            target_path=str(row["target_path"]) if row["target_path"] else None,
            rationale=str(row["rationale"]),
            contract_refs=list(self._parse_json(row["contract_refs_json"], [])),
            baseline_scores=dict(self._parse_json(row["baseline_scores_json"], {})),
            acceptance_criteria=str(row["acceptance_criteria"]) if row["acceptance_criteria"] else None,
            checker_shell=str(row["checker_shell"]) if row["checker_shell"] else None,
            status=str(row["status"] or "OPEN"),
            assigned_agent=str(row["assigned_agent"]) if row["assigned_agent"] else None,
            created_at=int(row["created_at"] or 0),
            updated_at=int(row["updated_at"] or row["created_at"] or 0),
            legacy_id=int(row["legacy_id"]) if row["legacy_id"] is not None else None,
            source_kind=str(row["source_kind"]) if row["source_kind"] else None,
            triage_reason=str(row["triage_reason"]) if row["triage_reason"] else None,
            resolution_note=str(row["resolution_note"]) if row["resolution_note"] else None,
            resolved_validation_id=str(row["resolved_validation_id"]) if row["resolved_validation_id"] else None,
            superseded_by=str(row["superseded_by"]) if row["superseded_by"] else None,
        )

    def _sort_key(self, bead: SovereignBead) -> tuple[int, float, int, str]:
        status_rank = {status: index for index, status in enumerate(PROJECTION_STATUS_ORDER)}
        return (
            status_rank.get(bead.status, len(status_rank)),
            self._overall_score(bead),
            bead.created_at,
            bead.id,
        )

    def _claim_sort_key(self, bead: SovereignBead) -> tuple[int, float, int, str]:
        status_priority = 0 if bead.status == "SET" else 1
        return (
            status_priority,
            self._overall_score(bead),
            bead.created_at,
            bead.id,
        )

    def _format_projection_line(self, bead: SovereignBead) -> str:
        def clean(value: str | None) -> str:
            return re.sub(r"\s+", " ", value or "").strip()

        marker = PROJECTION_MARKERS.get(bead.status, "[ ]")
        target = clean(bead.target_path or bead.target_ref or f"{bead.target_kind.lower()}:unscoped")
        overall = self._overall_score(bead)
        contract_suffix = ""
        if bead.contract_refs:
            contract_suffix = f" | contracts: {', '.join(clean(ref) for ref in bead.contract_refs)}"
        assignment_suffix = f" | agent: {clean(bead.assigned_agent)}" if bead.assigned_agent else ""
        acceptance_suffix = f" | acceptance: {clean(bead.acceptance_criteria)}" if bead.acceptance_criteria else ""
        triage_suffix = f" | triage: {clean(bead.triage_reason)}" if bead.triage_reason else ""
        resolution_suffix = f" | note: {clean(bead.resolution_note)}" if bead.resolution_note else ""
        validation_suffix = f" | validation: {clean(bead.resolved_validation_id)}" if bead.resolved_validation_id else ""
        superseded_suffix = f" | superseded_by: {clean(bead.superseded_by)}" if bead.superseded_by else ""
        line = (
            f"- {marker} [{bead.id}] `{target}` :: {clean(bead.rationale)}"
            f" | scan: {bead.scan_id} | baseline: {overall:.2f}"
            f"{assignment_suffix}{contract_suffix}{acceptance_suffix}{triage_suffix}{resolution_suffix}{validation_suffix}{superseded_suffix}"
        )
        return line.rstrip()

    @staticmethod
    def _overall_score(bead: SovereignBead) -> float:
        baseline = bead.baseline_scores or {}
        value = baseline.get("overall", baseline.get("scan_baseline", baseline.get("repository_baseline", 0)))
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def _parse_json(value: str | bytes | None, fallback: Any) -> Any:
        if value in (None, ""):
            return fallback
        try:
            return json.loads(value)
        except (TypeError, json.JSONDecodeError):
            return fallback

    @staticmethod
    def _merge_scores(existing: dict[str, Any] | None, incoming: dict[str, Any] | None) -> dict[str, Any]:
        merged = dict(existing or {})
        for key, value in dict(incoming or {}).items():
            merged[key] = value
        return merged

    @staticmethod
    def _normalized_contract_refs(contract_refs: Sequence[str] | None) -> tuple[str, ...]:
        return _normalized_contract_refs(contract_refs)

    @staticmethod
    def has_executable_contract_refs(contract_refs: Sequence[str] | None) -> bool:
        return _has_executable_contract_refs(contract_refs)

    @staticmethod
    def _has_target_identity(bead: SovereignBead) -> bool:
        return bool(bead.target_path or bead.target_ref)

    @classmethod
    def _is_actionable(cls, bead: SovereignBead) -> bool:
        return (
            cls._has_target_identity(bead)
            and bool(bead.acceptance_criteria)
            and cls.has_executable_contract_refs(bead.contract_refs)
        )

    @classmethod
    def _is_claimable(cls, bead: SovereignBead) -> bool:
        return bead.status in {"OPEN", "SET"} and cls._is_actionable(bead)

    @staticmethod
    def _new_bead_id() -> str:
        return f"bead:{uuid.uuid4().hex[:12]}"

    @staticmethod
    def _section_title(status: str) -> str:
        mapping = {
            "OPEN": "Open Beads",
            "SET-PENDING": "Set-Pending Beads",
            "SET": "Set Beads",
            "IN_PROGRESS": "Beads In Progress",
            "READY_FOR_REVIEW": "Beads Ready For Review",
            "NEEDS_TRIAGE": "Beads Requiring Triage",
            "BLOCKED": "Blocked Beads",
            "RESOLVED": "Resolved Beads",
            "ARCHIVED": "Archived Beads",
            "SUPERSEDED": "Superseded Beads",
        }
        return mapping.get(status, status.title())

    @staticmethod
    def _normalize_target_kind(target_kind: str | None, target_path: str | None) -> str:
        if target_kind:
            return str(target_kind).upper()
        return "FILE" if target_path else "OTHER"

    @staticmethod
    def _normalize_target_ref(target_kind: str | None, target_ref: str | None, target_path: str | None) -> str | None:
        if target_ref:
            return normalize_hall_path(target_ref) if "/" in target_ref or "\\" in target_ref else target_ref
        if target_path:
            return normalize_hall_path(target_path)
        if target_kind == "REPOSITORY":
            return "repository"
        return None

    def _normalize_materialized_bead(self, conn, bead: SovereignBead) -> SovereignBead:
        inferred_kind, inferred_ref, inferred_path = self._infer_target_identity(bead)
        source_kind = bead.source_kind or ("LEGACY_IMPORT" if bead.legacy_id is not None else "SYSTEM")
        normalized = SovereignBead(
            id=bead.id,
            repo_id=bead.repo_id,
            scan_id=bead.scan_id,
            target_kind=inferred_kind,
            target_ref=inferred_ref,
            target_path=inferred_path,
            rationale=bead.rationale,
            contract_refs=list(bead.contract_refs),
            baseline_scores=dict(bead.baseline_scores),
            acceptance_criteria=bead.acceptance_criteria,
            status=bead.status,
            assigned_agent=bead.assigned_agent,
            created_at=bead.created_at,
            updated_at=bead.updated_at,
            legacy_id=bead.legacy_id,
            source_kind=source_kind,
            triage_reason=bead.triage_reason,
            resolution_note=bead.resolution_note,
            resolved_validation_id=bead.resolved_validation_id,
            superseded_by=bead.superseded_by,
        )

        if self._is_system_execution_telemetry(normalized):
            normalized.status = "ARCHIVED"
            normalized.assigned_agent = None
            normalized.triage_reason = None
            normalized.resolution_note = (
                normalized.resolution_note
                or "System execution telemetry retained outside the actionable bead backlog."
            )
            normalized.updated_at = self._now() if normalized != bead else normalized.updated_at
            return normalized

        normalized = self._backfill_initialization_fields(normalized)
        if self._can_reopen_from_initialization_triage(normalized):
            normalized.status = "OPEN"
            normalized.assigned_agent = None
            normalized.triage_reason = None

        has_validation = self._find_accepted_validation_id(conn, normalized.id) is not None

        if normalized.status in ("OPEN", "IN_PROGRESS", "READY_FOR_REVIEW"):
            if not self._has_target_identity(normalized):
                normalized.status = "NEEDS_TRIAGE"
                normalized.triage_reason = "Missing canonical target identity."
                normalized.assigned_agent = None
            elif not normalized.acceptance_criteria:
                normalized.status = "NEEDS_TRIAGE"
                normalized.triage_reason = "Missing acceptance criteria."
                normalized.assigned_agent = None
            elif not self.has_executable_contract_refs(normalized.contract_refs):
                normalized.status = "NEEDS_TRIAGE"
                normalized.triage_reason = "Missing canonical contract references."
                normalized.assigned_agent = None
            elif normalized.status == "READY_FOR_REVIEW" and not has_validation:
                normalized.triage_reason = normalized.triage_reason or "Awaiting canonical validation evidence."
        elif normalized.status == "BLOCKED" and not normalized.triage_reason:
            normalized.triage_reason = "Blocker not recorded."

        if normalized.status == "BLOCKED" and not self._has_target_identity(normalized):
            normalized.status = "NEEDS_TRIAGE"
            normalized.triage_reason = "Imported blocker lacks canonical target identity."
            normalized.assigned_agent = None
        elif normalized.status == "BLOCKED" and normalized.legacy_id is not None and not normalized.acceptance_criteria:
            normalized.status = "NEEDS_TRIAGE"
            normalized.triage_reason = "Imported legacy bead requires canonical acceptance criteria."
            normalized.assigned_agent = None
        elif (
            normalized.status == "BLOCKED"
            and normalized.legacy_id is not None
            and not self.has_executable_contract_refs(normalized.contract_refs)
        ):
            normalized.status = "NEEDS_TRIAGE"
            normalized.triage_reason = "Imported legacy bead requires canonical contract references."
            normalized.assigned_agent = None

        if normalized.status == "RESOLVED":
            if not normalized.resolved_validation_id and has_validation:
                normalized.resolved_validation_id = self._find_accepted_validation_id(conn, normalized.id)
            if not normalized.resolved_validation_id and normalized.legacy_id is not None:
                normalized.status = "ARCHIVED"
                normalized.resolution_note = (
                    normalized.resolution_note
                    or "Legacy resolved bead archived without canonical validation evidence."
                )

        if normalized.status == "ARCHIVED" and not normalized.resolution_note:
            normalized.resolution_note = "Historical bead retained for continuity."

        if normalized.status == "SUPERSEDED" and not normalized.superseded_by:
            normalized.triage_reason = normalized.triage_reason or "Superseding bead not recorded."

        normalized.updated_at = self._now() if normalized != bead else normalized.updated_at
        return normalized

    @staticmethod
    def _is_system_execution_telemetry(bead: SovereignBead) -> bool:
        if bead.source_kind != "SYSTEM":
            return False
        if bead.status not in {"OPEN", "IN_PROGRESS", "READY_FOR_REVIEW", "NEEDS_TRIAGE"}:
            return False
        rationale = bead.rationale.strip()
        if not any(rationale.startswith(prefix) for prefix in SYSTEM_TELEMETRY_PREFIXES):
            return False
        return bead.target_kind in {"SYSTEM", "WEAVE", "SKILL"}

    def _backfill_initialization_fields(self, bead: SovereignBead) -> SovereignBead:
        contract_refs = list(bead.contract_refs)
        acceptance_criteria = bead.acceptance_criteria

        if bead.source_kind == "LEVEL_5_DIAGNOSTIC":
            if not contract_refs:
                contract_refs = self._derive_contract_refs(bead)
            if not acceptance_criteria:
                acceptance_criteria = self._derive_diagnostic_acceptance_criteria(bead)
        elif bead.source_kind == "LEVEL_5_RESTORATION":
            if not contract_refs:
                contract_refs = self._derive_contract_refs(bead)
            if not acceptance_criteria:
                acceptance_criteria = self._derive_restoration_acceptance_criteria(bead)
        elif bead.source_kind == "SYSTEM" and bead.id.endswith((":child:architecture", ":child:technical", ":child:ledger")):
            if not contract_refs:
                contract_refs = self._derive_contract_refs(bead)
            if not acceptance_criteria:
                acceptance_criteria = self._derive_system_child_acceptance_criteria(bead)
        elif bead.source_kind == "SYSTEM" and not contract_refs and acceptance_criteria and bead.target_path:
            contract_refs = self._derive_contract_refs(bead)

        if contract_refs == bead.contract_refs and acceptance_criteria == bead.acceptance_criteria:
            return bead

        return SovereignBead(
            id=bead.id,
            repo_id=bead.repo_id,
            scan_id=bead.scan_id,
            target_kind=bead.target_kind,
            target_ref=bead.target_ref,
            target_path=bead.target_path,
            rationale=bead.rationale,
            contract_refs=contract_refs,
            baseline_scores=dict(bead.baseline_scores),
            acceptance_criteria=acceptance_criteria,
            checker_shell=bead.checker_shell,
            status=bead.status,
            assigned_agent=bead.assigned_agent,
            created_at=bead.created_at,
            updated_at=bead.updated_at,
            legacy_id=bead.legacy_id,
            source_kind=bead.source_kind,
            triage_reason=bead.triage_reason,
            resolution_note=bead.resolution_note,
            resolved_validation_id=bead.resolved_validation_id,
            superseded_by=bead.superseded_by,
        )

    @staticmethod
    def _dedupe_lines(lines: Sequence[str]) -> str:
        seen: set[str] = set()
        ordered: list[str] = []
        for line in lines:
            clean = " ".join(str(line).split()).strip()
            if not clean or clean in seen:
                continue
            seen.add(clean)
            ordered.append(clean)
        return "\n".join(ordered)

    def _derive_contract_refs(self, bead: SovereignBead) -> list[str]:
        target_path = normalize_hall_path(bead.target_path) if bead.target_path else None
        target_ref = normalize_hall_path(bead.target_ref) if bead.target_ref and ("/" in bead.target_ref or "\\" in bead.target_ref) else bead.target_ref

        if bead.target_kind in {"FILE", "VALIDATION"} and target_path:
            return [f"file:{target_path}"]
        if bead.target_kind == "SECTOR":
            sector = target_path or target_ref
            if sector:
                return [f"sector:{sector}"]
        if bead.target_kind in {"WORKFLOW", "WEAVE", "SKILL", "SYSTEM"}:
            ref = target_ref or target_path
            if ref:
                return [f"runtime:{ref}"]
        if target_path:
            return [f"file:{target_path}"]
        if target_ref:
            return [f"runtime:{target_ref}"]
        return []

    def _derive_diagnostic_acceptance_criteria(self, bead: SovereignBead) -> str:
        target = bead.target_path or bead.target_ref or bead.id
        rationale = bead.rationale
        lowered = rationale.lower()
        lines = [
            f"Resolve the cited diagnostic findings for {target}.",
            f"Record canonical validation evidence for {target}.",
        ]
        if "missing explicit 1:1 unit test" in lowered or "linscott breach" in lowered:
            lines.insert(0, f"Add or update a focused 1:1 test that exercises {target}.")
        if "file weight exceeds 500 lines" in lowered or "high complexity risk" in lowered:
            lines.insert(0, f"Reduce complexity in {target} through bounded extraction or simplification without changing intended behavior.")
        if "legacy/action term found" in lowered or "legacy" in lowered:
            lines.insert(0, f"Remove stale legacy terminology in {target} so the file matches current CStar authority.")
        return self._dedupe_lines(lines)

    def _derive_restoration_acceptance_criteria(self, bead: SovereignBead) -> str:
        scope = bead.target_path or bead.target_ref or bead.id
        match = re.search(r"(\d+)\s+Linscott Breaches?", bead.rationale)
        breach_count = match.group(1) if match else None
        lines = [
            f"Run the restoration sweep for {scope}.",
            f"Record canonical validation evidence for the remediation work in {scope}.",
        ]
        if breach_count:
            lines.insert(1, f"Reduce or decompose the cited {breach_count} Linscott breaches in {scope} into bounded follow-through work.")
        return self._dedupe_lines(lines)

    def _derive_system_child_acceptance_criteria(self, bead: SovereignBead) -> str:
        target = bead.target_path or bead.target_ref or bead.id
        rationale = bead.rationale.strip()
        if rationale.startswith("Architectural decomposition and provider-fit planning for "):
            return self._dedupe_lines([
                f"Produce a bounded provider-fit architecture plan for {target}.",
                "Leave the planning session ready for the next deterministic execution path.",
            ])
        if rationale.startswith("Hall/state mutation follow-through for "):
            return self._dedupe_lines([
                f"Complete the required Hall/state mutation follow-through for {target}.",
                "Record the resulting Hall mutation in the canonical ledger.",
            ])
        if rationale.startswith("Architectural decomposition for "):
            return self._dedupe_lines([
                f"Produce a bounded architecture/decomposition plan for {target}.",
                "Leave the follow-through scoped tightly enough for the next worker pass.",
            ])
        return self._dedupe_lines([
            f"Complete the bounded follow-through for {target}.",
            "Record the resulting validation or ledger evidence.",
        ])

    def _can_reopen_from_initialization_triage(self, bead: SovereignBead) -> bool:
        if bead.status != "NEEDS_TRIAGE":
            return False
        if bead.source_kind not in {"LEVEL_5_DIAGNOSTIC", "LEVEL_5_RESTORATION", "SYSTEM"}:
            return False
        if bead.triage_reason not in {
            "Missing canonical target identity.",
            "Missing acceptance criteria.",
            "Missing canonical contract references.",
        }:
            return False
        return (
            self._has_target_identity(bead)
            and bool(bead.acceptance_criteria)
            and self.has_executable_contract_refs(bead.contract_refs)
        )

    def _infer_target_identity(self, bead: SovereignBead) -> tuple[str, str | None, str | None]:
        target_kind = self._normalize_target_kind(bead.target_kind, bead.target_path)
        target_ref = self._normalize_target_ref(target_kind, bead.target_ref, bead.target_path)
        target_path = normalize_hall_path(bead.target_path) if bead.target_path else None

        if target_path:
            return target_kind, target_ref, target_path

        rationale = bead.rationale
        sector_match = re.match(r"SCAN_SECTOR:\s*(.+)$", rationale.strip())
        if sector_match:
            sector = normalize_hall_path(sector_match.group(1).strip())
            return "SECTOR", sector, None

        path_match = re.search(r"`([^`\s]+)`", rationale)
        if path_match:
            inferred_path = normalize_hall_path(path_match.group(1))
            return "FILE", inferred_path, inferred_path

        if "ravens_harness" in rationale:
            return "VALIDATION", "ravens_harness", None
        if "WAR ROOM" in rationale:
            return "SPOKE", "WAR_ROOM", None
        if "vis/" in rationale or "React-Three-Fiber" in rationale or "D3" in rationale:
            return "SECTOR", "src/tools/pennyone/vis", None
        if "repo" in rationale.lower():
            return "REPOSITORY", "repository", None

        return target_kind, target_ref, target_path

    def _find_accepted_validation_id(self, conn, bead_id: str, validation_id: str | None = None) -> str | None:
        if validation_id:
            row = conn.execute(
                """
                SELECT validation_id
                FROM hall_validation_runs
                WHERE bead_id = ? AND validation_id = ? AND verdict IN ('ACCEPTED', 'SUCCESS')
                LIMIT 1
                """,
                (bead_id, validation_id),
            ).fetchone()
            return str(row["validation_id"]) if row else None

        row = conn.execute(
            """
            SELECT validation_id
            FROM hall_validation_runs
            WHERE bead_id = ? AND verdict IN ('ACCEPTED', 'SUCCESS')
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (bead_id,),
        ).fetchone()
        return str(row["validation_id"]) if row else None

    def _apply_legacy_supersession(self, beads: list[SovereignBead]) -> list[SovereignBead]:
        seen: dict[tuple[str, str | None, str | None, str], SovereignBead] = {}
        updated: list[SovereignBead] = []
        for bead in sorted(beads, key=lambda item: (item.created_at, item.id)):
            if bead.source_kind != "LEGACY_IMPORT" or bead.status not in {"NEEDS_TRIAGE", "ARCHIVED", "SUPERSEDED"}:
                updated.append(bead)
                continue

            key = (bead.target_kind, bead.target_ref, bead.target_path, bead.rationale)
            canonical = seen.get(key)
            if canonical is None:
                seen[key] = bead
                updated.append(bead)
                continue

            superseded = SovereignBead(
                id=bead.id,
                repo_id=bead.repo_id,
                scan_id=bead.scan_id,
                target_kind=bead.target_kind,
                target_ref=bead.target_ref,
                target_path=bead.target_path,
                rationale=bead.rationale,
                contract_refs=list(bead.contract_refs),
                baseline_scores=dict(bead.baseline_scores),
                acceptance_criteria=bead.acceptance_criteria,
                status="SUPERSEDED",
                assigned_agent=None,
                created_at=bead.created_at,
                updated_at=self._now(),
                legacy_id=bead.legacy_id,
                source_kind=bead.source_kind,
                triage_reason=bead.triage_reason,
                resolution_note=bead.resolution_note or "Duplicate legacy bead superseded during canonical hardening.",
                resolved_validation_id=bead.resolved_validation_id,
                superseded_by=canonical.id,
            )
            updated.append(superseded)
        return updated

    @staticmethod
    def _now() -> int:
        return int(time.time() * 1000)
