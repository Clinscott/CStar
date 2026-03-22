import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path
from src.core.engine.wardens.scour import ScourWarden

@pytest.fixture
def warden():
    with patch("src.core.engine.wardens.base.BraveSearch"):
        return ScourWarden(Path("/tmp/root"))

def test_scour_legacy_commands(warden):
    mock_content = "Please run c* start and then c* ravens."
    
    with patch("os.walk") as mock_walk, \
         patch.object(Path, "read_text", return_value=mock_content), \
         patch.object(Path, "relative_to", return_value=Path("test.md")), \
         patch("src.core.engine.wardens.scour.SovereignHUD"):
        
        mock_walk.return_value = [("/tmp/root", [], ["test.md"])]
        
        breaches = warden._scour_legacy_commands()
        
        assert len(breaches) == 2
        assert breaches[0]["type"] == "LEGACY_COMMAND"
        assert "c* start" in breaches[0]["action"]
        assert "c* ravens" in breaches[1]["action"]

def test_scour_orphaned_stats(warden):
    with patch.object(Path, "exists", side_effect=[True, False, False, False, False, False]):
        # Path.exists() for stats_dir, then for 5 potential src locations
        with patch.object(Path, "glob", return_value=[Path("/tmp/root/.stats/orphaned.json")]):
            breaches = warden._scour_orphaned_stats()
            assert len(breaches) == 1
            assert breaches[0]["type"] == "ORPHANED_STATS"

def test_scour_stale_lore(warden):
    with patch.object(Path, "exists", return_value=True), \
         patch.object(Path, "glob", return_value=[Path("/tmp/root/.agents/lore/test.bak"), Path("/tmp/root/.agents/lore/real.md")]):
        
        breaches = warden._scour_stale_lore()
        assert len(breaches) == 1
        assert breaches[0]["type"] == "STALE_LORE"
        assert "test.bak" in breaches[0]["file"]

def test_scan_calls_all_submethods(warden):
    with patch.object(warden, "_scour_legacy_commands", return_value=[{"type": "L"}]), \
         patch.object(warden, "_scour_orphaned_stats", return_value=[{"type": "O"}]), \
         patch.object(warden, "_scour_stale_lore", return_value=[{"type": "S"}]), \
         patch("src.core.engine.wardens.scour.SovereignHUD"):
        
        breaches = warden.scan()
        assert len(breaches) == 3
        types = [b["type"] for b in breaches]
        assert "L" in types and "O" in types and "S" in types
