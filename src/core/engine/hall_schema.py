from __future__ import annotations

from .hall_records import (
    PERSONA_PROJECTION_INTEGRITY,
    PERSONA_PROJECTION_SCHEMA,
    LEGACY_PERSONA_PROJECTION_SCHEMA,
    HallBeadRecord,
    HallBeadStatus,
    HallBeadTargetKind,
    HallEpisodicMemoryRecord,
    HallFileRecord,
    HallPlanningSessionRecord,
    HallPlanningSessionStatus,
    HallRepositoryRecord,
    HallRepositoryStatus,
    HallScanRecord,
    HallScanStatus,
    HallSkillObservation,
    HallSkillProposalRecord,
    HallSkillProposalStatus,
    HallValidationRun,
    HallValidationVerdict,
    build_persona_projection_metadata,
    build_repo_id,
    is_persona_projection_self_consistent,
    persona_projection_consistency_status,
    normalize_hall_path,
)
from .hall_schema_core import HallSchemaCoreMixin
from .hall_schema_memory import HallSchemaMemoryMixin
from .hall_schema_skills import HallSchemaSkillMixin
from .hall_schema_migration import HallSchemaMigrationMixin


class HallOfRecords(
    HallSchemaCoreMixin,
    HallSchemaMemoryMixin,
    HallSchemaSkillMixin,
    HallSchemaMigrationMixin,
):
    """Canonical SQLite-backed Hall schema for repository scans and outcomes."""


__all__ = [
    "PERSONA_PROJECTION_INTEGRITY",
    "PERSONA_PROJECTION_SCHEMA",
    "LEGACY_PERSONA_PROJECTION_SCHEMA",
    "HallBeadRecord",
    "HallBeadStatus",
    "HallBeadTargetKind",
    "HallEpisodicMemoryRecord",
    "HallFileRecord",
    "HallOfRecords",
    "HallPlanningSessionRecord",
    "HallPlanningSessionStatus",
    "HallRepositoryRecord",
    "HallRepositoryStatus",
    "HallScanRecord",
    "HallScanStatus",
    "HallSkillObservation",
    "HallSkillProposalRecord",
    "HallSkillProposalStatus",
    "HallValidationRun",
    "HallValidationVerdict",
    "build_persona_projection_metadata",
    "build_repo_id",
    "is_persona_projection_self_consistent",
    "persona_projection_consistency_status",
    "normalize_hall_path",
]
