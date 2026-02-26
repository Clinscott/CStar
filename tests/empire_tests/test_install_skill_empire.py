import json

from src.skills.install_skill import _get_config, _sanitize_skill_name


def test_sanitize_skill_name():
    assert _sanitize_skill_name("valid-skill_123") == "valid-skill_123"
    assert _sanitize_skill_name("invalid/skill") is None
    assert _sanitize_skill_name("bad;name") is None

def test_get_config(tmp_path):
    # Valid config
    config_file = tmp_path / "config.json"
    config_file.write_text(json.dumps({"FrameworkRoot": "/test"}), encoding='utf-8')
    config, err = _get_config(str(tmp_path))
    assert config["FrameworkRoot"] == "/test"
    assert err is None

    # Missing config
    config, err = _get_config(str(tmp_path / "missing"))
    assert config is None
    assert "Config Error" in err
