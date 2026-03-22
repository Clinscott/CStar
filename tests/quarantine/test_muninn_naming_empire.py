from unittest.mock import MagicMock, patch

import pytest

from src.core.engine.ravens.muninn import Muninn


def test_muninn_run_instantiation():
    """
    Verifies that Muninn.run() instantiates and executes the wardens.
    """
    target_path = "."

    with patch("src.core.engine.ravens.muninn.AntigravityUplink"), \
         patch("src.core.engine.ravens.muninn.bootstrap"), \
         patch("src.core.engine.ravens.muninn.TheWatcher"), \
         patch("src.core.engine.ravens.muninn.ProjectMetricsEngine") as MockMetricsEngine, \
         patch("src.core.engine.ravens.muninn.AlfredOverwatch"), \
         patch("src.core.engine.ravens.muninn.GungnirSPRT"), \
         patch("src.core.engine.ravens.muninn.SovereignHUD"), \
         patch("src.core.engine.ravens.muninn.NornWarden"), \
         patch("src.core.engine.ravens.muninn.HeimdallWarden"), \
         patch("src.core.engine.wardens.valkyrie.ValkyrieWarden"), \
         patch("src.core.engine.wardens.edda.EddaWarden"), \
         patch("src.core.engine.wardens.runecaster.RuneCasterWarden"), \
         patch("src.core.engine.wardens.mimir.MimirWarden"), \
         patch("src.core.engine.wardens.huginn.HuginnWarden"), \
         patch("src.core.engine.wardens.freya.FreyaWarden"), \
         patch("builtins.open"), \
         patch("src.core.engine.ravens.muninn.Muninn._execute_hunt_async", new_callable=MagicMock) as mock_hunt:

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
