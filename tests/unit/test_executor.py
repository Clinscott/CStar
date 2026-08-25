from types import SimpleNamespace
from unittest.mock import patch

from src.core.engine.executor import SovereignExecutor


@patch("src.core.engine.executor.SovereignHUD.persona_log")
def test_legacy_executor_never_installs_or_writes_forge_state(mock_log, tmp_path):
    executor = SovereignExecutor(tmp_path, tmp_path)
    executor.handle_proactive(SimpleNamespace(target_workflow="LOCAL_SKILL_CANDIDATE"))
    executor.suggest_forge("build a better scan planner")

    assert list(tmp_path.iterdir()) == []
    messages = [str(call.args[1]) for call in mock_log.call_args_list]
    assert any("Automatic skill installation is retired" in message for message in messages)
    assert any("Forge bypass retired" in message for message in messages)
