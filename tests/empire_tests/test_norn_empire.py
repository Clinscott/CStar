
import sys
from pathlib import Path

import pytest

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.sentinel.wardens.norn import NornWarden


class TestNornEmpire:

    @pytest.fixture
    def mock_root(self, tmp_path):
        """Creates a mock project root with tasks.qmd."""
        return tmp_path

    def test_scan_no_plan(self, mock_root):
        """Test behavior when plan does not exist."""
        warden = NornWarden(mock_root)
        results = warden.scan()
        assert results == []

    def test_scan_valid_task(self, mock_root):
        """Test finding a valid task."""
        plan_path = mock_root / "tasks.qmd"
        content = """
# Task List
- [x] Done thing
- [ ] Fix bug
- [ ] Feature X
"""
        plan_path.write_text(content, encoding='utf-8')

        warden = NornWarden(mock_root)
        results = warden.scan()

        assert len(results) == 1
        breach = results[0]
        assert breach["type"] == "CAMPAIGN_TASK"
        assert breach["file"] == "tasks.qmd"
        assert "Fix bug" in breach["action"]
        # Should be the first unchecked one
        assert breach["line"] == 4

    def test_scan_completed_task(self, mock_root):
        """Test ignoring completed tasks."""
        plan_path = mock_root / "tasks.qmd"
        content = """
- [x] Done thing
- [x] Also done
"""
        plan_path.write_text(content, encoding='utf-8')

        warden = NornWarden(mock_root)
        results = warden.scan()

        assert results == []

    def test_mark_complete(self, mock_root):
        """Test marking a task complete."""
        plan_path = mock_root / "tasks.qmd"
        content = """
# List
- [ ] Todo item
"""
        plan_path.write_text(content.strip(), encoding='utf-8')

        warden = NornWarden(mock_root)
        targets = warden.scan()
        assert len(targets) == 1

        # Mark it complete
        warden.mark_complete(targets[0]['raw_target'])

        # Verify file content
        new_content = plan_path.read_text(encoding='utf-8')
        assert "- [x] Todo item" in new_content

        # Verify scan returns nothing now
        results = warden.scan()
        assert len(results) == 0

if __name__ == "__main__":
    pytest.main([__file__])
