
import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path
import json
import sys
import os

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.sentinel.wardens.freya import FreyaWarden

class TestFreyaEmpire:
    """
    [Saga] Docstring missing.
    """
    
    @pytest.fixture
    def mock_root(self, tmp_path):
        """Creates a mock project root with necessary structure."""
        (tmp_path / "src" / "core").mkdir(parents=True)

        return tmp_path

    def test_scan_no_files(self, mock_root):
        warden = FreyaWarden(mock_root)
        results = warden.scan()
        assert results == []

    def test_scan_hover_breach(self, mock_root):
        """Test detection of buttons missing hover states."""
        tsx_file = mock_root / "src" / "components" / "MyButton.tsx"
        tsx_file.parent.mkdir(parents=True, exist_ok=True)
        tsx_file.write_text('<button className="bg-red-500 text-white">Click me</button>', encoding='utf-8')
        
        warden = FreyaWarden(mock_root)
        results = warden.scan()
        
        breach = next((b for b in results if b["type"] == "FREYA_HOVER_MISSING"), None)
        assert breach is not None
        assert breach["file"] == str(tsx_file.relative_to(mock_root))

    def test_scan_tailwind_arbitrary(self, mock_root):
        """Test detection of arbitrary Tailwind values."""
        tsx_file = mock_root / "src" / "components" / "BadStyle.tsx"
        tsx_file.parent.mkdir(parents=True, exist_ok=True)
        tsx_file.write_text('<div className="w-[350px]">Custom Width</div>', encoding='utf-8')
        
        warden = FreyaWarden(mock_root)
        results = warden.scan()
        
        breach = next((b for b in results if b["type"] == "FREYA_TAILWIND_ARBITRARY"), None)
        assert breach is not None
        assert "-[350px]" in breach["action"]

    def test_scan_color_deviance(self, mock_root):
        """Test detection of non-standard hex codes."""
        # Setup color theory
        theory_path = mock_root / "src" / "core" / "color_theory.json"
        theory_data = {
            "palettes": {
                "primary": {"blue": "#0000FF"}
            }
        }
        theory_path.write_text(json.dumps(theory_data), encoding='utf-8')

        tsx_file = mock_root / "src" / "components" / "BadColor.tsx"
        tsx_file.parent.mkdir(parents=True, exist_ok=True)
        # #FF0000 is red, not in our allowed palette
        tsx_file.write_text('<div style={{ color: "#FF0000" }}>Red</div>', encoding='utf-8')
        
        warden = FreyaWarden(mock_root)
        results = warden.scan()
        
        breach = next((b for b in results if b["type"] == "FREYA_COLOR_DEVIANCE"), None)
        assert breach is not None
        assert "#FF0000" in breach["action"]

    def test_valid_file(self, mock_root):
        """Test a clean file."""
        theory_path = mock_root / "src" / "core" / "color_theory.json"
        theory_path.write_text(json.dumps({"palettes": {}}), encoding='utf-8')

        tsx_file = mock_root / "src" / "components" / "GoodButton.tsx"
        tsx_file.parent.mkdir(parents=True, exist_ok=True)
        tsx_file.write_text('<button className="bg-blue-500 hover:bg-blue-600">Good</button>', encoding='utf-8')
        
        warden = FreyaWarden(mock_root)
        results = warden.scan()
        assert len(results) == 0

if __name__ == "__main__":
    pytest.main([__file__])