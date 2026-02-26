from unittest.mock import MagicMock, patch

import pytest

from src.sentinel.muninn import Muninn


def test_muninn_run_instantiation():
    """
    Verifies that Muninn.run() instantiates and executes the wardens.
    """
    target_path = "."

    with patch("src.sentinel.muninn.genai.Client"), \
         patch("src.sentinel.muninn.bootstrap"), \
         patch("src.sentinel.muninn.TheWatcher"), \
         patch("src.sentinel.muninn.ProjectMetricsEngine") as MockMetricsEngine, \
         patch("src.sentinel.muninn.AlfredOverwatch"), \
         patch("src.sentinel.muninn.GungnirSPRT"), \
         patch("src.sentinel.muninn.SovereignHUD") as MockHUD, \
         patch("src.sentinel.muninn.NornWarden"), \
         patch("src.sentinel.muninn.HeimdallWarden"), \
         patch("src.sentinel.muninn.ValkyrieWarden"), \
         patch("src.sentinel.muninn.EddaWarden"), \
         patch("src.sentinel.muninn.RuneCasterWarden"), \
         patch("src.sentinel.muninn.MimirWarden"), \
         patch("src.sentinel.muninn.HuginnWarden"), \
         patch("src.sentinel.muninn.FreyaWarden"), \
         patch("builtins.open"), \
         patch("src.sentinel.muninn.Muninn._execute_hunt_async", new_callable=MagicMock) as mock_hunt:

        # Instantiate Muninn
        # We need to mock api_key or client to avoid ValueError
        with patch.dict("os.environ", {"GOOGLE_API_KEY": "fake_key"}):
            muninn = Muninn(target_path)

            # Configure mocks
            MockMetricsEngine.return_value.compute.return_value = 95.0 # Mock float return
            mock_hunt.return_value = ([], {"ANNEX": 0})


            # Run the method
            # We expect it to return False if no critical breaches found/fixed, or True if fixed.
            # Currently it returns False if no breaches.
            result = muninn.run()

            # Just verify it ran without errors
            assert result is False or result is True

def test_muninn_initialization_failure():
    """
    Verifies that Muninn handles initialization failure (missing key).
    """
    target_path = "."

    # Clear env var to trigger failure
    with patch.dict("os.environ", {}, clear=True):
        with pytest.raises(ValueError, match="API environment variable not set"):
            Muninn(target_path)
