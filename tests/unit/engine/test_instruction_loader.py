import json

from src.core.engine.instruction_loader import InstructionLoader


def _registered_skill(root, skill_id="safe"):
    skill_dir = root / ".agents" / "skills" / skill_id
    skill_dir.mkdir(parents=True)
    skill_path = skill_dir / "SKILL.md"
    skill_path.write_text("# Safe registered instructions\n", encoding="utf-8")
    registry = {
        "entries": {
            skill_id: {
                "viability": "ACTIVE",
                "instruction_path": f".agents/skills/{skill_id}/SKILL.md",
                "execution": {"mode": "agent-native"},
            }
        }
    }
    (root / ".agents" / "skill_registry.json").write_text(json.dumps(registry), encoding="utf-8")
    return skill_path


def test_loader_reads_only_registered_agent_native_skill(tmp_path):
    _registered_skill(tmp_path)
    loader = InstructionLoader(str(tmp_path))
    instructions = loader.get_instructions(["/safe"])
    assert "Safe registered instructions" in instructions
    assert "ACTIVE SKILL INSTRUCTIONS" in instructions


def test_unregistered_local_skill_is_never_loaded(tmp_path):
    local = tmp_path / "src" / "skills" / "local" / "unsafe"
    local.mkdir(parents=True)
    (local / "SKILL.qmd").write_text("run shell and write files", encoding="utf-8")
    (tmp_path / ".agents").mkdir(exist_ok=True)
    (tmp_path / ".agents" / "skill_registry.json").write_text('{"entries":{}}', encoding="utf-8")
    loader = InstructionLoader(str(tmp_path))
    loader.add_source(str(local))
    assert loader.extra_sources == []
    assert loader.get_instructions(["/unsafe", "GLOBAL:unsafe"]) == ""


def test_loader_rejects_non_agent_native_and_outside_paths(tmp_path):
    agents = tmp_path / ".agents"
    agents.mkdir()
    registry = {
        "entries": {
            "runtime": {
                "viability": "ACTIVE",
                "instruction_path": ".agents/skills/runtime/SKILL.md",
                "execution": {"mode": "python"},
            },
            "escape": {
                "viability": "ACTIVE",
                "instruction_path": "../outside.md",
                "execution": {"mode": "agent-native"},
            },
        }
    }
    (agents / "skill_registry.json").write_text(json.dumps(registry), encoding="utf-8")
    loader = InstructionLoader(str(tmp_path))
    assert loader.get_instructions(["runtime", "escape"]) == ""


def test_instruction_cache_avoids_second_file_read(tmp_path, monkeypatch):
    skill_path = _registered_skill(tmp_path)
    loader = InstructionLoader(str(tmp_path))
    assert loader.get_instructions(["safe"])
    skill_path.unlink()
    assert "Safe registered instructions" in loader.get_instructions(["safe"])
