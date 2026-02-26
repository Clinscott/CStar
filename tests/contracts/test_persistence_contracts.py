import io
import json
import os
import sys
import unittest
from unittest.mock import mock_open, patch

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
sys.path.append(PROJECT_ROOT)
sys.path.append(os.path.join(PROJECT_ROOT, ".agent", "scripts"))

from src.games.odin_protocol.engine.persistence import OdinPersistence


class TestPersistence_contracts(unittest.TestCase):
    def setUp(self):
        self.captured_output = io.StringIO()
        sys.stdout = self.captured_output
        self.persistence = OdinPersistence(PROJECT_ROOT)
        # Create a mock UniverseState explicitly convertible to dict if needed
        # But save_state expects a dict for 'state' arg based on type hint in file,
        # BUT logic.py passes UniverseState object? No, persistence.py says 'state: dict[str, Any]'.
        # Wait, let's check persistence.py source again from Step 129.
        # "state: dict[str, Any]".
        # So we pass a dict.
        self.state_dict = {"domination_percent": 50.0}

    def tearDown(self):
        sys.stdout = sys.__stdout__

    def test_transition(self):
        # >>> CONTRACT 1: SAVE GAME <<<
        # GIVEN Game State exists [SAVE]

        # WHEN Save is requested
        with patch("builtins.open", mock_open()) as mock_file:
            with patch("subprocess.run") as mock_git:
                # save_state(self, state, world_name, outcome)
                self.persistence.save_state(self.state_dict, "TestWorld", "Victory")

                # THEN JSON file is written to disk
                # Check call to save_state.json
                found_save = any("save_state.json" in str(call) for call in mock_file.mock_calls)
                self.assertTrue(found_save)

                # THEN Commit is triggered [GIT]
                mock_git.assert_called()
                args = mock_git.call_args[0][0]
                self.assertIn("git", args)
                self.assertIn("commit", args)

        # >>> CONTRACT 2: LOAD CORRUPT <<<
        # GIVEN Save file is corrupt
        # WHEN Load is requested
        with patch("os.path.exists", return_value=True):
            with patch("builtins.open", mock_open(read_data="{ CORRUPT JSON ")):
                with patch("json.load", side_effect=json.JSONDecodeError("Expecting value", "", 0)):
                    with patch("logging.error") as mock_log:
                        state = self.persistence.load_state()

                        # THEN Fallback State is loaded (None returned on failure)
                        self.assertIsNone(state)

                        # THEN Warning is logged
                        mock_log.assert_called()
                        self.assertIn("Could not load state", mock_log.call_args[0][0])

if __name__ == '__main__':
    unittest.main()
