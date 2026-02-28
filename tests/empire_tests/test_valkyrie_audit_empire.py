import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Ensure project root is in path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

from src.sentinel.wardens.valkyrie import ValkyrieWarden
class TestValkyrieWarden:
    @pytest.fixture
    def warden(self, tmp_path):
        return ValkyrieWarden(tmp_path)

    @patch('vulture.Vulture')
    def test_scan_ignores_init(self, mock_vulture_cls, warden, tmp_path):
        mock_vulture = mock_vulture_cls.return_value

        # Mock an unused item in __init__.py
        mock_item = MagicMock()
        mock_item.filename = str(tmp_path / "__init__.py")
        mock_item.confidence = 100
        mock_item.message = "unused"

        mock_vulture.get_unused_code.return_value = [mock_item]

        results = warden.scan()
        assert len(results) == 0

    @patch('vulture.Vulture')
    def test_scan_filters_confidence(self, mock_vulture_cls, warden, tmp_path):
        mock_vulture = mock_vulture_cls.return_value

        # Mock a low confidence item
        mock_item = MagicMock()
        mock_item.filename = str(tmp_path / "logic.py")
        mock_item.confidence = 15
        mock_item.message = "possible dead code"

        mock_vulture.get_unused_code.return_value = [mock_item]

        results = warden.scan()
        assert len(results) == 0
