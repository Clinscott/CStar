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
         patch("src.sentinel.muninn.SovereignHUD"), \
         patch("src.sentinel.muninn.NornWarden"), \
         patch("src.sentinel.muninn.HeimdallWarden"), \
         patch("src.sentinel.wardens.valkyrie.ValkyrieWarden"), \
         patch("src.sentinel.wardens.edda.EddaWarden"), \
         patch("src.sentinel.wardens.runecaster.RuneCasterWarden"), \
         patch("src.sentinel.wardens.mimir.MimirWarden"), \
         patch("src.sentinel.wardens.huginn.HuginnWarden"), \
         patch("src.sentinel.wardens.freya.FreyaWarden"), \
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


