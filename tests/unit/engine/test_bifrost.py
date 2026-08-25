from unittest.mock import patch

import pytest

from src.core.engine.bifrost import (
    LEGACY_SKILL_FORGE_EFFECT_ERROR,
    SkillForge,
)


@pytest.fixture
def forge(tmp_path):
    return SkillForge(failure_log_path=str(tmp_path / "failures.jsonl"))


def test_analyze_voids_remains_detached(forge) -> None:
    assert forge.analyze_voids() == []


@pytest.mark.parametrize(
    "invoke",
    [
        lambda forge: forge.record_failure("test query", 0.5),
        lambda forge: forge.synthesize_bridge(["query1", "query2"]),
    ],
)
@patch("builtins.open")
@patch("pathlib.Path.write_text")
@patch("pathlib.Path.mkdir")
def test_skill_forge_actions_fail_before_file_effects(
    mock_mkdir,
    mock_write_text,
    mock_open,
    invoke,
    forge,
) -> None:
    with pytest.raises(
        RuntimeError,
        match=f"^{LEGACY_SKILL_FORGE_EFFECT_ERROR}$",
    ):
        invoke(forge)

    mock_open.assert_not_called()
    mock_write_text.assert_not_called()
    mock_mkdir.assert_not_called()
