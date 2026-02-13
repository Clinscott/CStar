import pytest
import json
from src.core.utils import load_config, sanitize_query

def test_load_config_missing(tmp_path):
    # Should return empty dict if .agent/config.json missing
    assert load_config(tmp_path) == {}

def test_load_config_valid(tmp_path):
    agent_dir = tmp_path / ".agent"
    agent_dir.mkdir()
    (agent_dir / "config.json").write_text(json.dumps({"test": "ok"}), encoding='utf-8')
    assert load_config(tmp_path) == {"test": "ok"}

def test_sanitize_query():
    assert sanitize_query("hello; world") == "hello world"
    assert sanitize_query("rm -rf /") == "rm -rf /" # ; is removed
    assert sanitize_query("") == ""
