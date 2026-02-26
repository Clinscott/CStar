
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.personas import AlfredStrategy, OdinStrategy, PersonaStrategy, get_strategy


class TestPersonasEmpire:

    def test_get_strategy_resolution(self):
        strategy = get_strategy("ODIN", ".")
        assert isinstance(strategy, OdinStrategy)

        strategy = get_strategy("ALFRED", ".")
        assert isinstance(strategy, AlfredStrategy)

        strategy = get_strategy("UNKNOWN", ".")
        assert isinstance(strategy, AlfredStrategy) # Default

    @patch("src.core.personas.Path.exists")
    @patch("src.core.personas.shutil.move")
    def test_quarantine_logic(self, mock_move, mock_exists):
        strategy = PersonaStrategy("dummy_root")

        # File exists
        mock_exists.return_value = True

        with patch("src.core.personas.Path.mkdir") as mock_mkdir:
            result = strategy._quarantine("some_file.txt")

            assert result is not None
            assert ".corvus_quarantine" in str(result)
            mock_mkdir.assert_called()
            mock_move.assert_called()

    @patch("src.core.personas.OdinStrategy._get_sovereign_state")
    @patch("builtins.open", new_callable=MagicMock)
    @patch("src.core.personas.Path.exists", return_value=True) # Avoid trying to create files if we say they exist
    def test_odin_policy_defiance(self, mock_exists, mock_open, mock_state):
        strategy = OdinStrategy("dummy_root")

        # Case 1: Defiance detected
        mock_state.return_value = {"some_module": "DEFIANCE"}
        context = strategy.enforce_policy()
        assert context["compliance_breach"] is True

        # Case 2: Compliance
        mock_state.return_value = {"some_module": "COMPLIANT"}
        context = strategy.enforce_policy()
        assert context["compliance_breach"] is False

    def test_voices(self):
        odin = OdinStrategy(".")
        alfred = AlfredStrategy(".")

        assert odin.get_voice() == "odin"
        assert alfred.get_voice() == "alfred"

    @patch("src.core.personas.Path.read_text")
    def test_sync_configs_alfred(self, mock_read):
        # Odin and Alfred usually share _sync_configs from base, but check implementation
        strategy = AlfredStrategy("dummy_root")

        mock_read.return_value = '{"persona": "OLD"}'

        with patch("src.core.personas.Path.write_text") as mock_write:
            with patch("src.core.personas.Path.exists", return_value=True):
                strategy._sync_configs("ALFRED")

                mock_write.assert_called()
                args, _ = mock_write.call_args
                content = args[0]
                assert '"persona": "ALFRED"' in content

if __name__ == "__main__":
    pytest.main([__file__])
