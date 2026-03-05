
from pathlib import Path
from unittest.mock import mock_open, patch

import pytest

from src.core.set_persona import PersonaManager


class TestSetPersonaEmpire:

    @patch("src.core.set_persona.Path.exists", return_value=True)
    @patch("src.core.set_persona.Path.open", new_callable=mock_open, read_data='{"persona": "ALFRED"}')
    def test_extract_persona(self, mock_file, mock_exists):
        manager = PersonaManager(target_root=Path("dummy_root"))
        assert manager.old_persona == "ALFRED"

    @patch("src.core.set_persona.Path.exists", return_value=True)
    @patch("src.core.set_persona.Path.open", new_callable=mock_open, read_data='{"persona": "ALFRED"}')
    def test_save_persona(self, mock_file, mock_exists):
        manager = PersonaManager(target_root=Path("dummy_root"))
        manager._save_persona("ODIN")

        # Check write
        mock_file.assert_called()
        handle = mock_file()
        # Verify allow write was called
        # The code executes open('r') then open('w').
        # Using mock_open, handle.write should be called with updated json

        # We can check specific calls
        # We expect a write with "ODIN"
        calls = handle.write.call_args_list
        # calls[0] might be partial writes if json.dump chunks it, but usually it writes the whole string or chunks.
        # simpler: check if any call contains "ODIN"

        written_content = "".join(call[0][0] for call in calls)
        assert "ODIN" in written_content

    @patch("src.core.set_persona.Path.exists", return_value=True)
    @patch("src.core.set_persona.Path.open", new_callable=mock_open, read_data='{"persona": "ALFRED"}')
    @patch("src.core.set_persona.SovereignHUD")
    def test_switch_interactive_cancel(self, mock_hud, mock_file, mock_exists):
        manager = PersonaManager(target_root=Path("dummy_root"))

        # Simulate user input "3" (invalid) then cancel? or just cancel.
        # Code: input() -> raises EOFError
        with patch("builtins.input", side_effect=KeyboardInterrupt):
            manager.switch(None)

        # Should not have called save
        # We can check if file was opened for writing ('w')
        # calls to open:
        # __init__ reads configs
        # switch doesn't reach save

        # Check that 'w' specific open was NOT called
        write_opens = [call for call in mock_file.mock_calls if 'w' in str(call)]
        assert len(write_opens) == 0

    @patch("src.core.set_persona.Path.exists", return_value=True)
    @patch("src.core.set_persona.Path.open", new_callable=mock_open, read_data='{"persona": "ALFRED"}')
    @patch("src.core.set_persona.SovereignHUD")
    @patch("src.core.personas.get_strategy")
    def test_switch_direct(self, mock_strat, mock_hud, mock_file, mock_exists):
        manager = PersonaManager(target_root=Path("dummy_root"))

        # Switch to ODIN
        # Since we are ALFRED, it prompts confirm if interactive.
        # But we pass target="ODIN", so interactive=False.


        # We need to mock _confirm_odin_switch if we want to be sure, but code says:
        # if not interactive: return True

        manager.switch("ODIN")

        # Should have saved
        # Check for write
        handle = mock_file()
        calls = handle.write.call_args_list
        written = "".join(call[0][0] for call in calls)
        assert "ODIN" in written

        mock_strat.assert_called()

if __name__ == "__main__":
    pytest.main([__file__])
