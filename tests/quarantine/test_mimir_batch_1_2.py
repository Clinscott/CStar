from unittest.mock import patch

import pytest

from src.core.engine.dialogue import DialogueEngine
from src.games.odin_protocol.engine.scenarios import SovereignScenarioEngine
from src.core.engine.utils.code_sanitizer import BifrostGate
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
    """The historical Muninn facade fails before provider or cycle setup."""
    with pytest.raises(
        RuntimeError,
        match="^legacy_python_ravens_engine_retired_use_cstar_kernel$",
    ):
        Muninn(project_root)

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
    """The historical Norn path cannot parse or mutate task projections."""
    with pytest.raises(
        RuntimeError,
        match="^legacy_python_autonomous_effect_surface_retired_use_cstar_kernel$",
    ):
        NornWarden(project_root)

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
    """Legacy installer remains importable but cannot mutate source."""
    with pytest.raises(
        RuntimeError,
        match="legacy_skill_installer_retired_use_supported_skill_installation_surface",
    ):
        install_skill("test-skill", target_root=str(project_root))
