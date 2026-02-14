
import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path
from src.sentinel.code_sanitizer import scan_and_enrich_imports

def test_scan_and_enrich_imports_valid_code():
    code = "import os\nimport sys"
    root = Path("/tmp")
    result = scan_and_enrich_imports(code, root)
    assert result == ""

@patch("src.sentinel.code_sanitizer.BraveSearch")
def test_scan_and_enrich_imports_invalid_import(MockBraveSearch):
    # Setup mock
    mock_searcher = MockBraveSearch.return_value
    mock_searcher.is_quota_available.return_value = True
    mock_searcher.search.return_value = [
        {"title": "FakeLib Docs", "description": "The best library", "url": "http://fakelib.org"}
    ]

    code = "import fakelib_xyz\nimport os"
    root = Path("/tmp")

    # Run
    # We need to mock _is_valid_import or ensure fakelib_xyz is not valid.
    # scan_and_enrich_imports calls _is_valid_import which checks _KNOWN_THIRD_PARTY
    # "fakelib_xyz" is definitely not in _KNOWN_THIRD_PARTY.
    
    # However, _is_valid_import also checks the project root for local modules.
    # Since /tmp/src probably doesn't exist, it should return False.
    
    result = scan_and_enrich_imports(code, root)

    # Verify
    mock_searcher.search.assert_called_with("fakelib_xyz latest documentation python")
    assert "[LIVE WEB DOCUMENTATION INJECTED]" in result
    assert "FakeLib Docs" in result
    assert "http://fakelib.org" in result

@patch("src.sentinel.code_sanitizer.BraveSearch")
def test_quota_exhausted(MockBraveSearch):
    mock_searcher = MockBraveSearch.return_value
    mock_searcher.is_quota_available.return_value = False
    
    code = "import fakelib_xyz"
    root = Path("/tmp")
    
    result = scan_and_enrich_imports(code, root)
    assert result == ""
    mock_searcher.search.assert_not_called()
