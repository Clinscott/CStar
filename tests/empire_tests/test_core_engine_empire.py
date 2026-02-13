import pytest
from src.core.ui import HUD

def test_hud_logging(capsys):
    HUD.PERSONA = "ALFRED"
    HUD.log("INFO", "Test message")
    captured = capsys.readouterr()
    assert "ALFRED" in captured.out or "[INFO]" in captured.out or "Test message" in captured.out
