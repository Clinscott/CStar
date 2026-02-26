from unittest.mock import patch

import pytest

from src.core.cstar_dispatcher import CorvusDispatcher


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

        def test_show_help_categorization(self, dispatcher):
            # We patch inside to catch the SovereignHUD instances currently in sys.modules
            # after CorvusDispatcher and its bootstrap have run.
            with patch('src.core.sovereign_hud.SovereignHUD.box_row') as mock_src_box_row:

                dispatcher.show_help()

                # Combine calls from both potential mocks
                calls_src = [call.args[0] for call in mock_src_box_row.call_args_list]

                assert "SCRIPTS" in calls_src
                assert "WORKFLOWS" in calls_src
