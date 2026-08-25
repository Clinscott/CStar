"""Retired autonomous vector-engine builder compatibility surface."""

from __future__ import annotations

from pathlib import Path
from typing import NoReturn

from src.core.engine.vector_ingest import LEGACY_SKILL_DIRECTORY_SCAN_ERROR


class SovereignBuilder:
    """Retain construction metadata while rejecting directory-backed builds."""

    def __init__(
        self,
        project_root: Path,
        base_path: Path,
        thresholds: dict[str, object],
    ) -> None:
        self.project_root = project_root
        self.base_path = base_path
        self.thresholds = dict(thresholds)

    def build_vector_engine(self, skills_db_path: Path) -> NoReturn:
        """Fail before path inspection, ingestion, construction, or indexing."""
        del skills_db_path
        raise RuntimeError(LEGACY_SKILL_DIRECTORY_SCAN_ERROR)
