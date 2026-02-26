from pathlib import Path

import pytest

from src.tools.brave_search import BraveSearch


class TestQuotaHardStop:
    @pytest.fixture(autouse=True)
    def setup_quota(self):
        """Ensure a clean quota file for testing."""
        self.quota_file = Path(".agent/brave_quota.json")
        self.backup = None
        if self.quota_file.exists():
            self.backup = self.quota_file.read_text()

        yield

        if self.backup:
            self.quota_file.write_text(self.backup)
        elif self.quota_file.exists():
            self.quota_file.unlink()

    def test_quota_increment(self, monkeypatch):
        """Verify that a successful search increments the quota."""
        monkeypatch.setenv("BRAVE_API_KEY", "test_key")

        # Mock requests.get to avoid actual API calls
        class MockResponse:
            def raise_for_status(self): pass
            def json(self): return {"web": {"results": []}}

        monkeypatch.setattr("requests.get", lambda *args, **kwargs: MockResponse())

        searcher = BraveSearch()
        initial_data = searcher._read_ledger()
        initial_count = initial_data.get("count", 0)

        searcher.search("test query")

        new_data = searcher._read_ledger()
        assert new_data["count"] == initial_count + 1

    def test_quota_hard_stop(self, monkeypatch):
        """Verify that search halts when quota is exhausted."""
        monkeypatch.setenv("BRAVE_API_KEY", "test_key")

        searcher = BraveSearch()
        # Manually exhaust quota
        data = searcher._read_ledger()
        data["count"] = 1000
        searcher._save_ledger(data)

        assert searcher.is_quota_available() is False

        results = searcher.search("test query")
        assert results == []

    def test_monthly_reset(self, monkeypatch):
        """Verify that quota resets on a new month."""
        searcher = BraveSearch()

        # Set quota to last month
        data = {"month": "2020-01", "count": 500}
        searcher._save_ledger(data)

        # Re-initialize searcher
        searcher._ensure_quota_ledger()

        new_data = searcher._read_ledger()
        assert new_data["count"] == 0
        assert new_data["month"] != "2020-01"
