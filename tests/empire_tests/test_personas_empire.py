
from pathlib import Path

import pytest

from src.core.personas import AlfredStrategy, OdinStrategy, PersonaStrategy, get_strategy


class TestPersonasEmpire:

    def test_get_strategy_resolution(self):
        strategy = get_strategy("ODIN", ".")
        assert isinstance(strategy, OdinStrategy)

        strategy = get_strategy("ALFRED", ".")
        assert isinstance(strategy, AlfredStrategy)

        strategy = get_strategy("UNKNOWN", ".")
        assert type(strategy) is PersonaStrategy
        assert strategy.get_voice() == "neutral"

    def test_quarantine_logic(self, tmp_path: Path):
        strategy = PersonaStrategy(tmp_path)

        assert not hasattr(strategy, "_quarantine")
        assert list(tmp_path.iterdir()) == []

    def test_odin_policy_defiance(self, tmp_path: Path):
        strategy = OdinStrategy(tmp_path)

        context = strategy.enforce_policy(compliance_breach=True)
        assert context == {"authority": "style_only", "persona": "ODIN"}
        assert list(tmp_path.iterdir()) == []

    def test_voices(self):
        odin = OdinStrategy(".")
        alfred = AlfredStrategy(".")

        assert odin.get_voice() == "odin"
        assert alfred.get_voice() == "alfred"

    def test_sync_configs_alfred(self, tmp_path: Path):
        strategy = AlfredStrategy(tmp_path)

        assert not hasattr(strategy, "_sync_configs")
        assert strategy.enforce_policy() == {
            "authority": "style_only",
            "persona": "ALFRED",
        }
        assert list(tmp_path.iterdir()) == []

if __name__ == "__main__":
    pytest.main([__file__])
