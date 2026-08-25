import json
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from src.games.odin_protocol.engine.persistence import OdinPersistence


class TestPersistence_contracts(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.persistence = OdinPersistence(self.tempdir.name)
        self.state_dict = {"domination_percent": 50.0}

    def tearDown(self):
        self.tempdir.cleanup()

    def test_transition(self):
        # >>> CONTRACT 1: SAVE GAME <<<
        # GIVEN Game State exists [SAVE]

        # WHEN Save is requested
        with patch.object(subprocess, "run") as mock_git:
            self.persistence.save_state(self.state_dict, "TestWorld", "Victory")

        self.assertEqual(
            json.loads(self.persistence.save_path.read_text(encoding="utf-8")),
            self.state_dict,
        )
        world_path = self.persistence.worlds_dir / "world_testworld.json"
        self.assertEqual(
            json.loads(world_path.read_text(encoding="utf-8")),
            {
                "world_name": "TestWorld",
                "outcome": "Victory",
                "final_state": self.state_dict,
            },
        )
        mock_git.assert_not_called()

        # >>> CONTRACT 2: LOAD CORRUPT <<<
        # GIVEN Save file is corrupt
        # WHEN Load is requested
        self.persistence.save_path.write_text("{ CORRUPT JSON ", encoding="utf-8")
        with patch(
            "src.games.odin_protocol.engine.persistence.logging.error"
        ) as mock_log:
            state = self.persistence.load_state()

        self.assertIsNone(state)
        mock_log.assert_called_once()
        self.assertIn("Could not load state", mock_log.call_args[0][0])

if __name__ == "__main__":
    unittest.main()
