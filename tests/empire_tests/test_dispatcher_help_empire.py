import pytest

from src.core.cstar_dispatcher import CorvusDispatcher, DECOMMISSIONED_ERROR


class TestCorvusDispatcher:
    @pytest.fixture
    def dispatcher(self, tmp_path):
        # Setup mock directories
        skills = tmp_path / ".agents" / "skills"
        skills.mkdir(parents=True)
        (skills / "test_cmd.py").write_text("print('hi')")

        workflows = tmp_path / ".agents" / "workflows"
        workflows.mkdir(parents=True)
        (workflows / "test_wf.md").write_text("# Workflow")

        return CorvusDispatcher(root=tmp_path)

    def test_discover_all(self, dispatcher):
        cmds = dispatcher._discover_all()
        assert cmds == {}

    def test_discovery_excludes_decommissioned_files_and_skill_directories(
        self,
        dispatcher,
    ):
        tools = dispatcher.project_root / "src" / "tools"
        tools.mkdir(parents=True)
        retired_tool = tools / "acquire.py"
        retired_tool.write_text("raise RuntimeError('must not dispatch')", encoding="utf-8")
        (tools / "acquire.DECOMMISSIONED.md").write_text("# retired\n", encoding="utf-8")

        skills = dispatcher.project_root / ".agents" / "skills"
        retired_skill = skills / "retired"
        (retired_skill / "scripts").mkdir(parents=True)
        (retired_skill / "scripts" / "retired.py").write_text(
            "raise RuntimeError('must not dispatch')",
            encoding="utf-8",
        )
        (retired_skill / "DECOMMISSIONED.md").write_text("# retired\n", encoding="utf-8")

        commands = dispatcher._discover_all()

        assert "acquire" not in commands
        assert "retired" not in commands

    def test_show_help_reports_decommission(self, dispatcher, capsys):
        dispatcher.show_help()
        assert DECOMMISSIONED_ERROR in capsys.readouterr().out

    def test_run_refuses_without_spawning(self, dispatcher):
        with pytest.raises(RuntimeError, match="permanently_decommissioned"):
            dispatcher.run(["test_cmd"])
