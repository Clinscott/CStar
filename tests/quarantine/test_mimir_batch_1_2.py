import asyncio
from unittest.mock import MagicMock, patch

import pytest

from src.core.engine.dialogue import DialogueEngine
from src.games.odin_protocol.engine.scenarios import SovereignScenarioEngine
from src.core.engine.ravens.code_sanitizer import BifrostGate
from src.core.engine.ravens.muninn import Muninn
from src.core.engine.wardens.norn import NornWarden
from src.skills.install_skill import install_skill


@pytest.fixture
def project_root(tmp_path):
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "core").mkdir()
    (tmp_path / "src" / "core" / "__init__.py").touch()
    return tmp_path

@pytest.mark.asyncio
async def test_muninn_refactor_calls(project_root):
    """Verify Muninn.run still executes phases correctly."""
    with patch("src.core.sovereign_hud.SovereignHUD.persona_log"), \
         patch.dict("os.environ", {"GOOGLE_API_KEY": "MOCK_KEY"}):


        muninn = Muninn(project_root)

        # Mock the heart to avoid actual execution
        muninn.heart = MagicMock()
        muninn.heart.execute_cycle = MagicMock(return_value=asyncio.Future())
        muninn.heart.execute_cycle.return_value.set_result(False)

        result = await muninn.run_cycle()
        assert result is False
        muninn.heart.execute_cycle.assert_called_once()

def test_code_sanitizer_imports(project_root):
    """Verify import validation and repair still work."""
    gate = BifrostGate(project_root)
    code = "import non_existent_mod\nimport os"
    bad_imports = gate.validate_imports(code)
    assert any("non_existent_mod" in b for b in bad_imports)
    assert not any("import os" in b for b in bad_imports)

    repaired = gate.repair_imports(code)
    assert "# [BIFROST REMOVED] import non_existent_mod" in repaired
    assert "non_existent_mod = MagicMock" in repaired
    assert "import os" in repaired

def test_norn_task_parsing(project_root):
    """Verify NornWarden still parses tasks correctly."""
    tasks_content = "# Tasks\n- [ ] Pending Task\n- [x] Completed Task"
    (project_root / "tasks.qmd").write_text(tasks_content)

    warden = NornWarden(project_root)
    target = warden.get_next_target()
    assert target is not None
    assert target["action"] == "Pending Task"
    assert target["line_index"] == 1

def test_dialogue_engine_scoring():
    """Verify DialogueEngine still scores and selects phrases."""
    engine = DialogueEngine(None)
    engine.phrase_data = {
        "ODIN": {
            "GREETING": [
                {"phrase": "Hello warrior", "tags": []},
                {"phrase": "The shield shatters!", "tags": ["compliance_breach"]}
            ]
        }
    }

    # Test with compliance breach
    context = {"compliance_breach": True}
    phrase = engine.get("ODIN", "GREETING", context)
    assert phrase == "The shield shatters!"

def test_scenario_generation_parity(project_root):
    """Verify SovereignScenarioEngine still generates scenarios with refactored logic."""
    forge = SovereignScenarioEngine()
    stats = {"Strength": 10.0, "Agility": 10.0}

    with patch("src.games.odin_protocol.engine.scenarios.hashlib.sha256") as mock_hash:
        mock_hash.return_value.hexdigest.return_value = "fixed_seed"
        scenario = forge.generate_scenario(stats, seed="TEST", turn_id=1)
        assert "planet_name" in scenario
        assert "options" in scenario
        assert len(scenario["options"]) == 4

def test_install_skill_interface(project_root):
    """Verify install_skill interface remains stable."""
    with patch("src.skills.install_skill._get_config") as mock_config, \
         patch("src.skills.install_skill.SovereignHUD.log"):

        mock_config.return_value = ({"FrameworkRoot": str(project_root)}, None)
        # Should fail early due to missing skills_db but test the flow
        install_skill("test-skill", target_root=str(project_root))
        mock_config.assert_called_once()
