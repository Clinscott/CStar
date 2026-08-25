import pytest

from src.core.utils import load_config, sanitize_query


def test_load_config_missing(tmp_path):
    with pytest.raises(RuntimeError, match="Direct secret-bearing configuration reads are retired"):
        load_config(tmp_path)

def test_load_config_never_uses_a_present_legacy_file(tmp_path):
    agent_dir = tmp_path / ".agents"
    agent_dir.mkdir()
    (agent_dir / "config.json").write_text('{"synthetic":"must-not-be-read"}', encoding="utf-8")
    with pytest.raises(RuntimeError, match="bounded CStar projection"):
        load_config(tmp_path)

def test_sanitize_query():
    assert sanitize_query("hello; world") == "hello world"
    assert sanitize_query("rm -rf /") == "rm -rf /" # ; is removed
    assert sanitize_query("") == ""
