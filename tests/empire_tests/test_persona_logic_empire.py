import json

from src.core.utils import load_config


def test_persona_loading(tmp_path):
    agent_dir = tmp_path / ".agent"
    agent_dir.mkdir()
    config_file = agent_dir / "config.json"
    config_file.write_text(json.dumps({"system": {"persona": "ODIN"}}), encoding='utf-8')

    # We mock or use the real load_config with the path
    config = load_config(str(tmp_path))
    assert config.get("system", {}).get("persona") == "ODIN"
