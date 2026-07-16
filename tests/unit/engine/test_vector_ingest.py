from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from src.core.engine.memory_db import MemoryDB
from src.core.engine.vector_ingest import (
    DETACHED_MEMORY_REQUIRED_ERROR,
    LEGACY_SKILL_DIRECTORY_SCAN_ERROR,
    VectorIngest,
    parse_skill_intent,
)


@pytest.fixture
def ingest() -> VectorIngest:
    return VectorIngest(MemoryDB("/synthetic/root"))


def test_vector_ingest_requires_real_detached_memory() -> None:
    with pytest.raises(RuntimeError, match=f"^{DETACHED_MEMORY_REQUIRED_ERROR}$"):
        VectorIngest(MagicMock())


def test_add_and_batch_skills_remain_process_local(ingest: VectorIngest) -> None:
    skills = [{"trigger": "s1", "description": "d1"}]

    ingest.add_skill("trigger", "text", "CORE")
    ingest.batch_add_skills(skills, "UI")

    assert skills == [{"trigger": "s1", "description": "d1"}]
    assert ingest.memory_db.search_intent("system", "trigger")[0]["trigger"] == "trigger"
    assert ingest.memory_db.search_intent("system", "s1")[0]["domain"] == "UI"


@pytest.mark.parametrize(
    ("content", "filename", "suffix", "expected"),
    [
        ("# Intent: Explicit intent\nBody", "one.py", ".py", "Explicit intent"),
        ("# Intent:\n# Next-line intent", "two.py", ".py", "Next-line intent"),
        ("description: Description intent\nBody", "three.py", ".py", "Description intent"),
        ("# Header intent\nBody", "four.qmd", ".qmd", "Header intent"),
        ("plain body", "five.txt", ".txt", "Intent for five.txt"),
    ],
)
def test_parse_skill_intent_is_detached(
    content,
    filename,
    suffix,
    expected,
) -> None:
    assert parse_skill_intent(
        content,
        filename=filename,
        suffix=suffix,
    ) == expected


@patch("pathlib.Path.exists")
@patch("pathlib.Path.glob")
@patch("pathlib.Path.read_text")
def test_directory_loading_fails_before_discovery_or_read(
    mock_read_text,
    mock_glob,
    mock_exists,
    ingest: VectorIngest,
) -> None:
    with pytest.raises(
        RuntimeError,
        match=f"^{LEGACY_SKILL_DIRECTORY_SCAN_ERROR}$",
    ):
        ingest.load_skills_from_dir("/synthetic/skills")

    with pytest.raises(
        RuntimeError,
        match=f"^{LEGACY_SKILL_DIRECTORY_SCAN_ERROR}$",
    ):
        ingest._read_intent(Path("/synthetic/skill.qmd"))

    mock_exists.assert_not_called()
    mock_glob.assert_not_called()
    mock_read_text.assert_not_called()
