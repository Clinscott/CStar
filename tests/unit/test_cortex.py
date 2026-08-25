from pathlib import Path
from unittest.mock import patch

import pytest

from src.core.engine.cortex import (
    LEGACY_CORTEX_RUNTIME_ERROR,
    Cortex,
    parse_cortex_sections,
)


def test_cortex_parser_operates_only_on_explicit_text() -> None:
    content = "Intro law.\n# AGENTS\nLaw 1: Be helpful.\n## Gates\nPreserve gates.\n"

    assert parse_cortex_sections("AGENTS", content) == [
        ("AGENTS > Intro", "Intro law."),
        ("AGENTS > AGENTS", "Law 1: Be helpful."),
        ("AGENTS > Gates", "Preserve gates."),
    ]
    assert Cortex.parse_sections("AGENTS", "# AGENTS\nBounded.") == [
        ("AGENTS > AGENTS", "Bounded.")
    ]


def test_cortex_parser_enforces_explicit_byte_limit() -> None:
    with pytest.raises(ValueError, match="explicit byte limit"):
        parse_cortex_sections("AGENTS", "abcd", max_bytes=3)


@patch("pathlib.Path.exists")
@patch("pathlib.Path.read_text")
@patch("pathlib.Path.stat")
def test_cortex_runtime_fails_before_project_polling(
    mock_stat,
    mock_read_text,
    mock_exists,
) -> None:
    with pytest.raises(RuntimeError, match=f"^{LEGACY_CORTEX_RUNTIME_ERROR}$"):
        Cortex(Path("/synthetic/project"), Path("/synthetic/base"))

    mock_exists.assert_not_called()
    mock_read_text.assert_not_called()
    mock_stat.assert_not_called()
