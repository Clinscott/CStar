import pytest
import re
from unittest.mock import MagicMock, patch
from pathlib import Path
from src.core.engine.wardens.taste import TasteWarden

@pytest.fixture
def warden():
    with patch("src.core.engine.wardens.base.BraveSearch"):
        return TasteWarden(Path("/tmp/root"))

def test_scan_slop_name(warden):
    mock_content = "const userName = 'John Doe';"
    with patch.object(Path, "rglob", return_value=[Path("/tmp/root/test.tsx")]), \
         patch.object(Path, "read_text", return_value=mock_content), \
         patch.object(Path, "relative_to", return_value=Path("test.tsx")), \
         patch.object(warden, "_should_ignore", return_value=False):
        
        breaches = warden.scan()
        assert len(breaches) == 1
        assert breaches[0]["type"] == "TASTE_SLOP_NAME"
        assert "John Doe" in breaches[0]["action"]

def test_scan_pure_black(warden):
    mock_content = "color: #000000; background: bg-black;"
    with patch.object(Path, "rglob", return_value=[Path("/tmp/root/test.tsx")]), \
         patch.object(Path, "read_text", return_value=mock_content), \
         patch.object(Path, "relative_to", return_value=Path("test.tsx")), \
         patch.object(warden, "_should_ignore", return_value=False):
        
        breaches = warden.scan()
        assert len(breaches) == 1
        assert breaches[0]["type"] == "TASTE_PURE_BLACK"

def test_scan_boring_layout(warden):
    mock_content = "<div className='grid grid-cols-3'></div>"
    with patch.object(Path, "rglob", return_value=[Path("/tmp/root/test.tsx")]), \
         patch.object(Path, "read_text", return_value=mock_content), \
         patch.object(Path, "relative_to", return_value=Path("test.tsx")), \
         patch.object(warden, "_should_ignore", return_value=False):
        
        breaches = warden.scan()
        assert len(breaches) == 1
        assert breaches[0]["type"] == "TASTE_BORING_LAYOUT"

def test_scan_organic_data(warden):
    mock_content = "const progress = '50%';"
    with patch.object(Path, "rglob", return_value=[Path("/tmp/root/test.tsx")]), \
         patch.object(Path, "read_text", return_value=mock_content), \
         patch.object(Path, "relative_to", return_value=Path("test.tsx")), \
         patch.object(warden, "_should_ignore", return_value=False):
        
        breaches = warden.scan()
        assert len(breaches) == 1
        assert breaches[0]["type"] == "TASTE_ORGANIC_DATA"
        assert "50%" in breaches[0]["action"]
