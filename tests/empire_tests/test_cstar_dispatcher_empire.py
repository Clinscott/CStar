from src.core.cstar_dispatcher import CorvusDispatcher


def test_dispatcher_discovery_is_permanently_disabled(tmp_path):
    # Stray scripts and workflows are not authority or executable capability.
    script_dir = tmp_path / "scripts"
    script_dir.mkdir()
    (script_dir / "test_cmd.py").write_text("print('hi')", encoding='utf-8')

    workflow_dir = tmp_path / ".agents" / "workflows"
    workflow_dir.mkdir(parents=True)
    (workflow_dir / "test_flow.md").write_text("# Flow", encoding='utf-8')

    dispatcher = CorvusDispatcher(root=tmp_path)
    cmds = dispatcher._discover_all()

    assert cmds == {}
