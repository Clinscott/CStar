import pytest
from pathlib import Path
from src.core.cstar_dispatcher import CorvusDispatcher
from unittest.mock import MagicMock, patch

class TestCorvusDispatcher:
    @pytest.fixture
    def dispatcher(self, tmp_path):
        # Setup mock directories
        skills = tmp_path / ".agent" / "skills"
        skills.mkdir(parents=True)
        (skills / "test_cmd.py").write_text("print('hi')")
        
        workflows = tmp_path / ".agent" / "workflows"
        workflows.mkdir(parents=True)
        (workflows / "test_wf.md").write_text("# Workflow")
        
        return CorvusDispatcher(root=tmp_path)

    def test_discover_all(self, dispatcher):
        cmds = dispatcher._discover_all()
        assert "test_cmd" in cmds
        assert "test_wf" in cmds
        assert cmds["test_cmd"].endswith(".py")
        assert cmds["test_wf"].endswith(".md")

    @patch('src.core.ui.HUD.box_row')
    def test_show_help_categorization(self, mock_box_row, dispatcher):
        dispatcher.show_help()
        # Verify box_row was called with Scripts and Workflows
        calls = [call.args[0] for call in mock_box_row.call_args_list]
        assert "SCRIPTS" in calls
        assert "WORKFLOWS" in calls
