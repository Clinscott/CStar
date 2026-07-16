import pytest

from src.skills.skill_forge import RETIRED_ERROR, SkillForge


def test_select_archetype(tmp_path):
    forge = SkillForge(str(tmp_path))
    assert forge.select_archetype("create a test for login", []) == "test"
    assert forge.select_archetype("automate the build", []) == "workflow"
    assert forge.select_archetype("parse this log", []) == "utility"

def test_extract_subject(tmp_path):
    forge = SkillForge(str(tmp_path))
    assert forge._extract_subject("create a log parser") == "log_parser"
    assert forge._extract_subject("build an automated test") == "automated" # 'test' is filtered
    assert forge._extract_subject("generate a complex workflow sequencer") == "complex_workflow_sequencer"

def test_validate_skill_safety(tmp_path):
    forge = SkillForge(str(tmp_path))
    # Dangerous pattern
    bad_code = "import os\nos.system('rm -rf /')"
    is_valid, msg = forge.validate_skill(bad_code)
    assert is_valid is False
    assert "Blocked dangerous pattern" in msg

    # Safe code
    good_code = "print('hello')"
    is_valid, msg = forge.validate_skill(good_code)
    assert is_valid is True


def test_forge_is_inert_and_does_not_create_drafts(tmp_path):
    forge = SkillForge(str(tmp_path))
    with pytest.raises(RuntimeError, match=RETIRED_ERROR):
        forge.forge("create a test")
    assert list(tmp_path.iterdir()) == []
