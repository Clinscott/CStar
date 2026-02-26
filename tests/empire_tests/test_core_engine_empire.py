import pytest
from src.core.sovereign_hud import SovereignHUD

def test_hud_logging(capsys):
    SovereignHUD.PERSONA = "ALFRED"
    SovereignHUD.log("INFO", "Test message")
    captured = capsys.readouterr()
    assert "ALFRED" in captured.out or "[INFO]" in captured.out or "Test message" in captured.out
