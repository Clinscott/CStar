"""Detached intent parsing and retired directory-based skill ingestion."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, NoReturn

from src.core.engine.memory_db import MemoryDB


LEGACY_SKILL_DIRECTORY_SCAN_ERROR = (
    "legacy_python_skill_directory_scan_retired_use_cstar_skill_registry"
)
DETACHED_MEMORY_REQUIRED_ERROR = (
    "legacy_python_vector_ingest_requires_detached_memory"
)


def parse_skill_intent(
    content: str,
    *,
    filename: str = "skill",
    suffix: str = "",
) -> str:
    """Parse an intent from explicit text without opening or discovering a file."""
    match = re.search(
        r"^# Intent:[ \t]*(.*)$",
        content,
        re.MULTILINE | re.IGNORECASE,
    )
    if match:
        intent = match.group(1).strip()
        if intent:
            return intent
        lines = content.splitlines()
        for index, line in enumerate(lines):
            if "# Intent:" in line and index + 1 < len(lines):
                return lines[index + 1].strip().lstrip("#").strip()

    match = re.search(r"^description:[ \t]*(.*)$", content, re.MULTILINE)
    if match:
        return match.group(1).strip()

    match = re.search(
        r'(?:#|""").*?Intent:\s*(.*?)(?:\n|""")',
        content,
        re.IGNORECASE | re.DOTALL,
    )
    if match:
        return match.group(1).strip()

    if suffix.lower() in {".qmd", ".md"}:
        match = re.search(r"^#\s*(.*)", content, re.MULTILINE)
        if match:
            return match.group(1).strip()

    return f"Intent for {filename}"


class VectorIngest:
    """Mutate only an explicitly detached in-process index."""

    parse_intent = staticmethod(parse_skill_intent)

    def __init__(self, memory_db: MemoryDB) -> None:
        if not isinstance(memory_db, MemoryDB) or memory_db.detached is not True:
            raise RuntimeError(DETACHED_MEMORY_REQUIRED_ERROR)
        self.memory_db = memory_db

    def add_skill(self, trigger: str, text: str, domain: str = "GENERAL") -> None:
        self.memory_db.upsert_skill("system", trigger, text, {"domain": domain})

    def batch_add_skills(
        self,
        skills: list[dict[str, Any]],
        domain: str = "GENERAL",
    ) -> None:
        normalized: list[dict[str, Any]] = []
        for skill in skills:
            metadata = dict(skill.get("metadata", {}))
            metadata.setdefault("domain", domain)
            normalized.append({**skill, "metadata": metadata})
        self.memory_db.batch_upsert_skills("system", normalized)

    def load_skills_from_dir(
        self,
        directory: str | Path,
        prefix: str = "",
    ) -> NoReturn:
        """Fail before path creation, discovery, reads, or index mutation."""
        del directory, prefix
        raise RuntimeError(LEGACY_SKILL_DIRECTORY_SCAN_ERROR)

    def _read_intent(self, file_path: Path) -> NoReturn:
        """Reject the former path-reading parser compatibility method."""
        del file_path
        raise RuntimeError(LEGACY_SKILL_DIRECTORY_SCAN_ERROR)
