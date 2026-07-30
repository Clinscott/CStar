from src.core.report_engine import ReportEngine


def test_report_engine_alfred_voice():
    engine = ReportEngine(persona="ALFRED")
    assert "A.L.F.R.E.D. Pennyworth" in engine.signature()
    assert "Verified." in engine.verdict("PASS", "all good")
    assert "⚓" in engine.header("Test Title")

def test_report_engine_odin_voice():
    engine = ReportEngine(persona="ODIN")
    assert "THE ALL-FATHER" in engine.signature()
    assert "JUDGMENT" in engine.verdict("PASS", "all good")
    assert "Ω" in engine.header("Test Title")
