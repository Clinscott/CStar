
from pathlib import Path
from unittest.mock import patch

from src.core.engine.ravens.code_sanitizer import BifrostGate


def test_scan_and_enrich_imports_valid_code():
    gate = BifrostGate(Path("/tmp"))
    code = "import os\nimport sys"
    result = gate.scan_and_enrich_imports(code)
    assert result == ""

@patch("src.core.engine.ravens.code_sanitizer.BraveSearch")
def test_scan_and_enrich_imports_invalid_import(MockBraveSearch):
    # Setup mock
    mock_searcher = MockBraveSearch.return_value
    mock_searcher.is_quota_available.return_value = True
    mock_searcher.search.return_value = [
        {"title": "FakeLib Docs", "description": "The best library", "url": "http://fakelib.org"}
    ]

    gate = BifrostGate(Path("/tmp"))
    code = "import fakelib_xyz\nimport os"

    result = gate.scan_and_enrich_imports(code)

    # Verify
    mock_searcher.search.assert_called_with("fakelib_xyz latest documentation python")
    assert "[LIVE WEB DOCUMENTATION INJECTED]" in result
    assert "FakeLib Docs" in result
    assert "http://fakelib.org" in result

@patch("src.core.engine.ravens.code_sanitizer.BraveSearch")
def test_quota_exhausted(MockBraveSearch):
    mock_searcher = MockBraveSearch.return_value
    mock_searcher.is_quota_available.return_value = False

    gate = BifrostGate(Path("/tmp"))
    code = "import fakelib_xyz"

    result = gate.scan_and_enrich_imports(code)
    assert result == ""
    mock_searcher.search.assert_not_called()
