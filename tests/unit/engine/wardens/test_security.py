import pytest
import re
from unittest.mock import MagicMock, patch
from pathlib import Path
from src.core.engine.wardens.security import SecurityWarden

@pytest.fixture
def warden():
    with patch("src.core.engine.wardens.base.BraveSearch"):
        return SecurityWarden(Path("/tmp/root"))

def test_scour_raw_env(warden):
    with patch("os.walk") as mock_walk, \
         patch.object(Path, "relative_to", return_value=Path(".env")), \
         patch("src.core.engine.wardens.security.SovereignHUD"):
        
        mock_walk.return_value = [("/tmp/root", [], [".env"])]
        
        breaches = warden._scour_raw_env()
        assert len(breaches) == 1
        assert breaches[0]["type"] == "EXPOSED_ENV"
        assert ".env" in breaches[0]["file"]

def test_scour_hardcoded_keys(warden):
    mock_content = "const key = 'AIzaSyA123456789012345678901234567890123';"
    with patch("os.walk") as mock_walk, \
         patch.object(Path, "read_text", return_value=mock_content), \
         patch.object(Path, "relative_to", return_value=Path("src/app.py")), \
         patch("src.core.engine.wardens.security.SovereignHUD"):
        
        mock_walk.return_value = [("/tmp/root/src", [], ["app.py"])]
        
        breaches = warden._scour_hardcoded_keys()
        assert len(breaches) == 1
        assert breaches[0]["type"] == "HARDCODED_SECRET"
        assert "REDACT" in breaches[0]["action"]

def test_scan_calls_submethods(warden):
    with patch.object(warden, "_scour_raw_env", return_value=[{"type": "E"}]), \
         patch.object(warden, "_scour_hardcoded_keys", return_value=[{"type": "H"}]), \
         patch("src.core.engine.wardens.security.SovereignHUD"):
        
        breaches = warden.scan()
        assert len(breaches) == 2
        types = [b["type"] for b in breaches]
        assert "E" in types and "H" in types
        
