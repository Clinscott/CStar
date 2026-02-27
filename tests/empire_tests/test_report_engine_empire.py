import unittest.mock as mock

from src.core.report_engine import ReportEngine


def test_report_engine_alfred_voice():
    # Mock config to force ALFRED
    with mock.patch("src.core.report_engine.utils.load_config") as mock_config:
        mock_config.return_value = {"persona": "ALFRED"}
        engine = ReportEngine()

        assert "A.L.F.R.E.D. Pennyworth" in engine.signature()
        assert "Verified." in engine.verdict("PASS", "all good")
        assert "⚓" in engine.header("Test Title")

def test_report_engine_odin_voice():
    # Mock config to force ODIN
    with mock.patch("src.core.report_engine.utils.load_config") as mock_config:
        mock_config.return_value = {"persona": "ODIN"}
        engine = ReportEngine()

        assert "THE ALL-FATHER" in engine.signature()
        assert "JUDGMENT" in engine.verdict("PASS", "all good")
        assert "Ω" in engine.header("Test Title")
