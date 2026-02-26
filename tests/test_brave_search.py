from datetime import datetime

import pytest
import requests

from src.tools.brave_search import BraveSearch


@pytest.fixture
def mock_brave_search(tmp_path, monkeypatch):
    """Creates a BraveSearch instance with a temporary quota file."""
    # Ensure .agent dir exists
    agent_dir = tmp_path / ".agent"
    agent_dir.mkdir()

    # Patch QUOTA_FILE to point to tmp_path
    monkeypatch.setattr(BraveSearch, "QUOTA_FILE", agent_dir / "brave_quota.json")
    monkeypatch.setenv("BRAVE_API_KEY", "mock_key")

    return BraveSearch()

def test_ensure_quota_ledger(mock_brave_search):
    """Verifies that the quota ledger is initialized correctly."""
    assert mock_brave_search.QUOTA_FILE.exists()
    data = mock_brave_search._read_ledger()
    assert data["month"] == datetime.now().strftime("%Y-%m")
    assert data["count"] == 0

def test_increment_quota(mock_brave_search):
    """Verifies that the quota count increments."""
    mock_brave_search._increment_quota()
    data = mock_brave_search._read_ledger()
    assert data["count"] == 1

def test_is_quota_available(mock_brave_search):
    """Verifies quota availability check."""
    assert mock_brave_search.is_quota_available() is True

    data = mock_brave_search._read_ledger()
    data["count"] = mock_brave_search.MAX_QUOTA
    mock_brave_search._save_ledger(data)

    assert mock_brave_search.is_quota_available() is False

def test_search_success(mock_brave_search, monkeypatch):
    """Verifies a successful search operation with mocking."""
    class MockResponse:
        def raise_for_status(self): pass
        def json(self):
            return {
                "web": {
                    "results": [
                        {"title": "Test Result", "description": "Test Desc", "url": "http://test.com"}
                    ]
                }
            }

    monkeypatch.setattr(requests, "get", lambda *args, **kwargs: MockResponse())

    results = mock_brave_search.search("test query")
    assert len(results) == 1
    assert results[0]["title"] == "Test Result"
    assert mock_brave_search._read_ledger()["count"] == 1

def test_search_no_api_key(tmp_path, monkeypatch):
    """Verifies behavior when BRAVE_API_KEY is missing."""
    monkeypatch.delenv("BRAVE_API_KEY", raising=False)
    # Re-patch QUOTA_FILE because we are creating a new instance
    agent_dir = tmp_path / ".agent"
    agent_dir.mkdir()
    monkeypatch.setattr(BraveSearch, "QUOTA_FILE", agent_dir / "brave_quota.json")

    searcher = BraveSearch()
    results = searcher.search("test")
    assert results == []

def test_search_quota_exhausted(mock_brave_search):
    """Verifies behavior when quota is exhausted."""
    data = mock_brave_search._read_ledger()
    data["count"] = mock_brave_search.MAX_QUOTA
    mock_brave_search._save_ledger(data)

    results = mock_brave_search.search("test")
    assert results == []

def test_search_retry_failure(mock_brave_search, monkeypatch):
    """Verifies retry logic failure."""
    def mock_get_fail(*args, **kwargs):
        raise requests.exceptions.RequestException("API Down")

    monkeypatch.setattr(requests, "get", mock_get_fail)
    # Set sleep to 0 to speed up test
    import time
    monkeypatch.setattr(time, "sleep", lambda x: None)

    results = mock_brave_search.search("test")
    assert results == []
    assert mock_brave_search._read_ledger()["count"] == 0
