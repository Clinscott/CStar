import os
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from src.core.engine.wardens.huginn import HuginnWarden
from src.core.engine.wardens.shadow_forge import ShadowForgeWarden
from src.tools.debug.verify_fish import verify_system_integrity


def test_huginn_constructs_a_keyless_uplink(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("GOOGLE_API_KEY", "retired-google")
    monkeypatch.setenv("GEMINI_API_KEY", "retired-gemini")
    monkeypatch.setenv("MUNINN_API_KEY", "retired-muninn")

    with patch("src.core.engine.wardens.huginn.AntigravityUplink") as uplink:
        warden = HuginnWarden(tmp_path)

    uplink.assert_called_once_with()
    assert not hasattr(warden, "api_key")


def test_shadow_forge_forwards_no_model_credentials(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("GOOGLE_API_KEY", "retired-google")
    monkeypatch.setenv("GEMINI_API_KEY", "retired-gemini")
    monkeypatch.setenv("MUNINN_API_KEY", "retired-muninn")
    monkeypatch.setenv("MINIMAX_API_KEY", "active-minimax")

    commands: list[list[str]] = []

    def fake_run(command: list[str], **_kwargs):
        commands.append(command)
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    with (
        patch(
            "src.core.engine.wardens.shadow_forge.shutil.which",
            return_value="docker",
        ),
        patch(
            "src.core.engine.wardens.shadow_forge.subprocess.run",
            side_effect=fake_run,
        ),
        patch.object(
            ShadowForgeWarden,
            "_promote_from_container",
            return_value=True,
        ),
    ):
        assert ShadowForgeWarden(tmp_path).execute_cycle() is True

    run_command = next(command for command in commands if command[1] == "run")
    container_env = [
        run_command[index + 1]
        for index, token in enumerate(run_command[:-1])
        if token == "-e"
    ]

    assert not any("_API_KEY" in entry for entry in container_env)


def test_integrity_verifier_does_not_inject_retired_google_state(
    monkeypatch,
) -> None:
    class MockMuninn:
        def __init__(self, root: str) -> None:
            self.root = root

    google_module = object()
    generative_module = object()
    monkeypatch.setitem(sys.modules, "google", google_module)
    monkeypatch.setitem(sys.modules, "google.generativeai", generative_module)
    monkeypatch.setenv("GOOGLE_API_KEY", "operator-value")
    monkeypatch.setattr("src.core.engine.ravens.muninn.Muninn", MockMuninn)

    assert verify_system_integrity() is True
    assert sys.modules["google"] is google_module
    assert sys.modules["google.generativeai"] is generative_module
    assert os.environ["GOOGLE_API_KEY"] == "operator-value"
