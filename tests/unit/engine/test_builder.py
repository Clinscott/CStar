from pathlib import Path
from unittest.mock import patch

import pytest

from src.core.engine.builder import SovereignBuilder
from src.core.engine.vector_ingest import LEGACY_SKILL_DIRECTORY_SCAN_ERROR


def test_builder_fails_before_directory_or_engine_effects(tmp_path) -> None:
    builder = SovereignBuilder(
        tmp_path / "project",
        tmp_path / "base",
        {"REC": 1.5},
    )

    with (
        patch("pathlib.Path.exists") as mock_exists,
        patch("pathlib.Path.read_text") as mock_read_text,
        patch("pathlib.Path.glob") as mock_glob,
    ):
        with pytest.raises(
            RuntimeError,
            match=f"^{LEGACY_SKILL_DIRECTORY_SCAN_ERROR}$",
        ):
            builder.build_vector_engine(Path("/synthetic/skills.db"))

    mock_exists.assert_not_called()
    mock_read_text.assert_not_called()
    mock_glob.assert_not_called()
