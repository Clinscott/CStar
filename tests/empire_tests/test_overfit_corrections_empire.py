
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[3] # tests/empire_tests/ -> root
# Actually my pattern was parents[2] for tests/empire_tests/file.py?
# tests/empire_tests is 2 levels deep from root?
# c:\Users\Craig\Corvus\CorvusStar\tests\empire_tests\test.py
# parents[0] = empire_tests
# parents[1] = tests
# parents[2] = CorvusStar
# Correct.

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Mock sv_engine module BEFORE import
sys.modules["sv_engine"] = MagicMock()

def teardown_module():
    if "sv_engine" in sys.modules:
        del sys.modules["sv_engine"]

# Import the module
# It executes top-level code (imports), so we need to be careful.
# It does sys.path.append.
# We can import it inside test or use patch.dict on sys.modules?
# But checking the file:
# sys.path.append(...)
# from sv_engine import SovereignVector
# This happens at module level.
# So if we import it, it runs.
# We already mocked sv_engine, so it should be fine.

from src.tools.data import overfit_corrections


class TestOverfitCorrectionsEmpire:

    @patch("src.tools.data.overfit_corrections.open")
    @patch("src.tools.data.overfit_corrections.SovereignVector")
    @patch("src.tools.data.overfit_corrections.json")
    def test_overfit_logic(self, mock_json, mock_sv_cls, mock_open_func):
        # Setup mocks
        mock_engine = mock_sv_cls.return_value

        # Mock json load for cases and coords
        # json.load is called twice.
        # 1. cases
        # 2. coords

        cases_data = {"test_cases": [
            {"query": "correction needed", "expected": "fixed"},
            {"query": "already good", "expected": "good"}
        ]}

        coords_data = {"phrase_mappings": {}}

        mock_json.load.side_effect = [cases_data, coords_data]

        # Mock engine search
        # Call 1: "correction needed" -> returns "wrong"
        # Call 2: "already good" -> returns "good"

        def search_side_effect(query):
            if query == "correction needed":
                return [{"trigger": "wrong"}]
            if query == "already good":
                return [{"trigger": "good"}]
            return []

        mock_engine.search.side_effect = search_side_effect

        # Run
        overfit_corrections.overfit()

        # Verify
        # Should have updated phrase_mappings
        # coords_data["phrase_mappings"] should have "correction needed": "fixed"

        # json.dump called
        mock_json.dump.assert_called()
        args = mock_json.dump.call_args[0]
        data_dumped = args[0]

        assert data_dumped["phrase_mappings"]["correction needed"] == "fixed"
        # "already good" should NOT be in mappings (or not added if not there)
        # In this logic, it adds if actual != expected.
        # If it was already correct, it doesn't add.

if __name__ == "__main__":
    pytest.main([__file__])
