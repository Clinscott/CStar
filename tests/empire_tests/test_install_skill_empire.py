from pathlib import Path

import pytest

from src.skills.install_skill import (
    RETIRED_ERROR,
    SkillInstaller,
    _get_config,
    _sanitize_skill_name,
    install_skill,
)


def test_sanitize_skill_name():
    assert _sanitize_skill_name("valid-skill_123") == "valid-skill_123"
    assert _sanitize_skill_name("invalid/skill") is None
    assert _sanitize_skill_name("bad;name") is None

def test_get_config(tmp_path):
    """The compatibility helper must never open a secret-bearing config."""
    config_file = tmp_path / "config.json"
    config_file.write_text("not-json-and-never-read", encoding="utf-8")
    config, err = _get_config(str(tmp_path))
    assert config is None
    assert err == RETIRED_ERROR
    assert config_file.read_text(encoding="utf-8") == "not-json-and-never-read"


def test_installer_is_inert(tmp_path):
    with pytest.raises(RuntimeError, match=RETIRED_ERROR):
        install_skill("safe-name", target_root=tmp_path)
    assert list(tmp_path.iterdir()) == []
    assert SkillInstaller._validate_path(tmp_path, tmp_path / "skills" / "safe")
    assert not SkillInstaller._validate_path(tmp_path, Path(tmp_path).parent / "escape")
