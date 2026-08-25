import json

from src.core.engine.context import SovereignContext
from src.core.set_persona import PersonaManager
from src.core.utils import load_config


def test_persona_loading(tmp_path):
    agent_dir = tmp_path / ".agents"
    agent_dir.mkdir()
    config_file = agent_dir / "config.json"
    config_file.write_text(json.dumps({"system": {"persona": "ODIN"}}), encoding='utf-8')

    # We mock or use the real load_config with the path
    config = load_config(str(tmp_path))
    assert config.get("system", {}).get("persona") == "ODIN"


def test_engine_context_reads_persona_as_style_without_mutation(tmp_path):
    agent_dir = tmp_path / ".agents"
    agent_dir.mkdir()
    config_file = agent_dir / "config.json"
    config_text = json.dumps(
        {
            "system": {"persona": "ODIN"},
            "policy": {"authority": "operator_and_repo"},
        }
    )
    config_file.write_text(config_text, encoding="utf-8")
    agents_file = tmp_path / "AGENTS.md"
    agents_file.write_text("canonical authority", encoding="utf-8")

    context = SovereignContext(tmp_path)

    assert context.persona_style_context == {
        "persona": "ODIN",
        "voice": "odin",
        "tone": "direct, terse, and technically precise",
        "domain_emphasis": [
            "systems architecture",
            "risk visibility",
            "explicit decision boundaries",
        ],
    }
    assert config_file.read_text(encoding="utf-8") == config_text
    assert agents_file.read_text(encoding="utf-8") == "canonical authority"
    assert not (tmp_path / ".cursorrules").exists()


def test_explicit_persona_switch_changes_style_field_only(tmp_path):
    agent_dir = tmp_path / ".agents"
    agent_dir.mkdir()
    config_file = agent_dir / "config.json"
    original = {
        "system": {
            "persona": "ALFRED",
            "authority_mode": "operator_and_repo_policy",
        },
        "policy": {"allow_deploy": False},
        "version": "test",
    }
    config_file.write_text(json.dumps(original), encoding="utf-8")
    agents_file = tmp_path / "AGENTS.md"
    agents_file.write_text("operator authority", encoding="utf-8")

    manager = PersonaManager(target_root=tmp_path)
    manager.switch("ODIN")

    updated = json.loads(config_file.read_text(encoding="utf-8"))
    assert updated["system"]["persona"] == "ODIN"
    assert updated["system"]["authority_mode"] == "operator_and_repo_policy"
    assert updated["policy"] == original["policy"]
    assert updated["version"] == original["version"]
    assert agents_file.read_text(encoding="utf-8") == "operator authority"
    assert not (tmp_path / ".cursorrules").exists()
    assert not (tmp_path / ".corvus_quarantine").exists()


def test_persona_switch_fails_closed_on_noncanonical_config(tmp_path):
    agent_dir = tmp_path / ".agents"
    agent_dir.mkdir()
    config_file = agent_dir / "config.json"
    config_file.write_text(json.dumps({"persona": "ALFRED"}), encoding="utf-8")

    manager = PersonaManager(target_root=tmp_path)
    manager.switch("ODIN")

    assert json.loads(config_file.read_text(encoding="utf-8")) == {"persona": "ALFRED"}
    assert not (agent_dir / "persona_audit.log").exists()
