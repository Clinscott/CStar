import pytest

from src.skills.local.workflow_analyst.analyze_workflow import WorkflowAnalyst


@pytest.fixture
def mock_workspace(tmp_path):
    """Creates a mock workspace with tasks and journal."""
    tasks = tmp_path / "tasks.md"
    tasks.write_text("- [ ] Task 1\n- [/] Stalled Task\n", encoding='utf-8')

    journal = tmp_path / "dev_journal.md"
    journal.write_text("Found a manual fix for the error. Broken code is slow.", encoding='utf-8')

    return tmp_path

def test_workflow_analyst_logic(mock_workspace):
    """Verifies that WorkflowAnalyst correctly identifies tasks and patterns."""
    analyst = WorkflowAnalyst(mock_workspace)
    # The paths are already set relative to mock_workspace in __init__

    report = analyst.analyze()

    assert "Task 1" in report["open_loops"]
    assert "Stalled Task" in report["stalled_tasks"]
    assert any("manual" in p for p in report["recurring_patterns"])
    assert any("CRITICAL" in s for s in report["suggestions"])
