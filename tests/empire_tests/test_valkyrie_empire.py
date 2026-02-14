
import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path
import sys

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.sentinel.wardens.valkyrie import ValkyrieWarden

class TestValkyrieEmpire:
    
    @pytest.fixture
    def mock_root(self, tmp_path):
        return tmp_path

    @patch("src.sentinel.wardens.valkyrie.vulture.Vulture")
    def test_scan_no_dead_code(self, mock_vulture_cls, mock_root):
        """Test clean scan with no dead code."""
        mock_vulture = mock_vulture_cls.return_value
        mock_vulture.get_unused_code.return_value = []
        
        warden = ValkyrieWarden(mock_root)
        results = warden.scan()
        
        assert results == []
        mock_vulture.scavenge.assert_called()

    @patch("src.sentinel.wardens.valkyrie.vulture.Vulture")
    def test_scan_detects_dead_code(self, mock_vulture_cls, mock_root):
        """Test detection of high confidence dead code."""
        mock_vulture = mock_vulture_cls.return_value
        
        # Mock item
        mock_item = MagicMock()
        mock_item.filename = str(mock_root / "dead.py")
        mock_item.lineno = 10
        mock_item.confidence = 100
        mock_item.message = "Unused function 'dead_func'"
        
        mock_vulture.get_unused_code.return_value = [mock_item]
        
        warden = ValkyrieWarden(mock_root)
        results = warden.scan()
        
        breach = next((b for b in results if b["type"] == "VALKYRIE_BREACH"), None)
        assert breach is not None
        assert "dead.py" in breach["file"]
        assert "dead_func" in breach["action"]

    @patch("src.sentinel.wardens.valkyrie.vulture.Vulture")
    def test_scan_filters_low_confidence(self, mock_vulture_cls, mock_root):
        """Test that low confidence items are ignored."""
        mock_vulture = mock_vulture_cls.return_value
        
        mock_item = MagicMock()
        mock_item.filename = str(mock_root / "maybe_dead.py")
        mock_item.confidence = 10 # Below default 60
        
        mock_vulture.get_unused_code.return_value = [mock_item]
        
        warden = ValkyrieWarden(mock_root)
        results = warden.scan()
        
        assert len(results) == 0

    @patch("src.sentinel.wardens.valkyrie.vulture.Vulture")
    def test_scan_ignores_init(self, mock_vulture_cls, mock_root):
        """Test that __init__.py files are ignored."""
        mock_vulture = mock_vulture_cls.return_value
        
        mock_item = MagicMock()
        mock_item.filename = str(mock_root / "__init__.py")
        mock_item.confidence = 100
        
        mock_vulture.get_unused_code.return_value = [mock_item]
        
        warden = ValkyrieWarden(mock_root)
        results = warden.scan()
        
        assert len(results) == 0

if __name__ == "__main__":
    pytest.main([__file__])
