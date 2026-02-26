
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.sentinel.wardens.mimir import MimirWarden


class TestMimirEmpire:

    @pytest.fixture
    def mock_root(self, tmp_path):
        """Creates a mock project root."""
        return tmp_path

    def test_scan_no_files(self, mock_root):
        warden = MimirWarden(mock_root)
        results = warden.scan()
        assert results == []

    def test_scan_clean_file(self, mock_root):
        """Test a file with low complexity."""
        py_file = mock_root / "simple.py"
        py_file.write_text("def foo():\n    return True\n", encoding='utf-8')

        warden = MimirWarden(mock_root)
        results = warden.scan()
        assert len(results) == 0

    def test_scan_complex_file(self, mock_root):
        """Test detection of high cyclomatic complexity."""
        py_file = mock_root / "complex.py"
        # Create a function with high complexity (many branches)
        # Using a loop to generate many if/elifs
        content = "def complex_func(x):\n"
        for i in range(15):
            content += f"    if x == {i}: return {i}\n"
        content += "    return -1\n"

        py_file.write_text(content, encoding='utf-8')

        warden = MimirWarden(mock_root)
        results = warden.scan()

        breach = next((b for b in results if b["type"] == "MIMIR_COMPLEXITY"), None)
        assert breach is not None
        assert "complex_func" in breach["action"]
        assert breach["file"] == "complex.py"

    def test_scan_maintainability(self, mock_root):
        """Test detection of low maintainability index."""
        # MI is hard to force low with small files, but we can verify it doesn't crash
        # or mock the maintainability_index function
        py_file = mock_root / "maintainable.py"
        py_file.write_text("print('hello')\n", encoding='utf-8')

        warden = MimirWarden(mock_root)
        # Mock radon metrics if needed, but integration test is better here
        # Let's trust radon works and checks if we get *any* result for a really bad file
        # (simulated by mocking radon)

        with patch("src.sentinel.wardens.mimir.mi_visit") as mock_mi:
            mock_mi.return_value = 20.0 # Very low MI
            results = warden.scan()

            breach = next((b for b in results if b["type"] == "MIMIR_MAINTAINABILITY"), None)
            assert breach is not None
            assert "Maintainability Index too low" in breach["action"]

if __name__ == "__main__":
    pytest.main([__file__])
